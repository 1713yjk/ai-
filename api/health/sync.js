const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

// 验证token中间件
function verifyToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    throw new Error('未提供token');
  }
  return jwt.verify(token, process.env.JWT_SECRET);
}

export default async function handler(req, res) {
  console.log(`[Health] 数据同步请求: ${req.method}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: '只支持POST请求' });
  }
  
  try {
    // 验证用户身份
    const decoded = verifyToken(req);
    const userId = decoded.userId;
    
    const { action, records } = req.body;
    
    if (action === 'upload') {
      // 上传本地记录到云端
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ success: false, message: '记录格式错误' });
      }
      
      let successCount = 0;
      let skipCount = 0;
      
      for (const record of records) {
        // 检查记录是否已存在
        const existing = await query(
          'SELECT id FROM health_records WHERE record_id = ?',
          [record.id]
        );
        
        if (existing.length > 0) {
          skipCount++;
          continue;
        }
        
        // 插入新记录
        await query(
          `INSERT INTO health_records 
           (user_id, record_id, test_type, test_name, test_date, answers, result, created_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            record.id,
            record.testType,
            record.testName,
            record.date,
            JSON.stringify(record.answers),
            JSON.stringify(record.result),
            record.timestamp ? new Date(record.timestamp) : new Date()
          ]
        );
        successCount++;
      }
      
      console.log(`[Health] 上传完成 - 成功:${successCount}, 跳过:${skipCount}`);
      
      return res.status(200).json({
        success: true,
        data: {
          uploaded: successCount,
          skipped: skipCount,
          total: records.length
        }
      });
      
    } else if (action === 'download') {
      // 下载云端记录到本地
      const { lastSyncTime } = req.body;
      
      let sql = 'SELECT * FROM health_records WHERE user_id = ?';
      let params = [userId];
      
      if (lastSyncTime) {
        sql += ' AND updated_at > ?';
        params.push(new Date(lastSyncTime));
      }
      
      sql += ' ORDER BY test_date DESC';
      
      const cloudRecords = await query(sql, params);
      
      // 转换为小程序格式
      const formattedRecords = cloudRecords.map(r => ({
        id: r.record_id,
        testType: r.test_type,
        testName: r.test_name,
        date: r.test_date,
        timestamp: new Date(r.test_date).getTime(),
        answers: JSON.parse(r.answers || '[]'),
        result: JSON.parse(r.result || '{}')
      }));
      
      console.log(`[Health] 下载 ${formattedRecords.length} 条记录`);
      
      return res.status(200).json({
        success: true,
        data: {
          records: formattedRecords,
          syncTime: new Date().toISOString()
        }
      });
      
    } else {
      return res.status(400).json({ success: false, message: '无效的action' });
    }
    
  } catch (error) {
    console.error('[Health] 同步错误:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'token无效' });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: '服务器错误',
      error: error.message 
    });
  }
}

