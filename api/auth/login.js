const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../utils/db');

export default async function handler(req, res) {
  console.log(`[Auth] 微信登录请求: ${req.method}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: '只支持POST请求' });
  }
  
  try {
    const { code, userInfo } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, message: '缺少code参数' });
    }
    
    // 1. 调用微信API换取openid
    const APPID = process.env.WECHAT_APPID;
    const SECRET = process.env.WECHAT_APPSECRET;
    
    const wxResponse = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`
    );
    
    const wxData = await wxResponse.json();
    
    if (wxData.errcode) {
      console.error('[Auth] 微信API错误:', wxData);
      return res.status(400).json({ 
        success: false, 
        message: '微信登录失败',
        error: wxData.errmsg 
      });
    }
    
    const { openid, unionid, session_key } = wxData;
    
    // 2. 查询或创建用户
    let user = await queryOne('SELECT * FROM users WHERE openid = ?', [openid]);
    
    if (!user) {
      // 创建新用户
      await query(
        `INSERT INTO users (openid, unionid, nickname, avatar_url, gender, country, province, city, last_login) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          openid,
          unionid || null,
          userInfo?.nickName || '微信用户',
          userInfo?.avatarUrl || '',
          userInfo?.gender || 0,
          userInfo?.country || '',
          userInfo?.province || '',
          userInfo?.city || ''
        ]
      );
      
      user = await queryOne('SELECT * FROM users WHERE openid = ?', [openid]);
      console.log('[Auth] 创建新用户:', user.id);
    } else {
      // 更新最后登录时间和用户信息
      if (userInfo) {
        await query(
          `UPDATE users SET nickname = ?, avatar_url = ?, gender = ?, 
           country = ?, province = ?, city = ?, last_login = NOW() WHERE id = ?`,
          [
            userInfo.nickName || user.nickname,
            userInfo.avatarUrl || user.avatar_url,
            userInfo.gender || user.gender,
            userInfo.country || user.country,
            userInfo.province || user.province,
            userInfo.city || user.city,
            user.id
          ]
        );
      } else {
        await query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
      }
      console.log('[Auth] 用户登录:', user.id);
    }
    
    // 重新获取用户信息
    user = await queryOne('SELECT * FROM users WHERE openid = ?', [openid]);
    
    // 3. 生成JWT token
    const token = jwt.sign(
      { userId: user.id, openid: user.openid },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // 4. 返回用户信息和token
    return res.status(200).json({
      success: true,
      data: {
        token,
        userInfo: {
          id: user.id,
          openid: user.openid,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          gender: user.gender
        }
      }
    });
    
  } catch (error) {
    console.error('[Auth] 登录错误:', error);
    return res.status(500).json({ 
      success: false, 
      message: '服务器错误',
      error: error.message 
    });
  }
}

