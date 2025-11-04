// 用户提交抽奖信息API
const { readJSON, writeJSON, getClientIP } = require('./oss-utils');

export default async function handler(req, res) {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: '仅支持POST请求'
        });
    }
    
    try {
        const { name, phone, wechat } = req.body;
        
        // 验证必填字段
        if (!name || !phone) {
            return res.status(400).json({
                success: false,
                error: '姓名和手机号为必填项'
            });
        }
        
        // 验证手机号格式
        if (!/^1[3-9]\d{9}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                error: '手机号格式不正确'
            });
        }
        
        // 获取客户端IP
        const ip = getClientIP(req);
        
        // 读取配置
        const config = await readJSON('lottery/config.json');
        if (!config) {
            return res.status(500).json({
                success: false,
                error: '活动配置未初始化'
            });
        }
        
        // 检查活动状态
        if (config.activity.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: '活动未开启或已结束'
            });
        }
        
        // 检查活动时间
        const now = new Date();
        const startTime = new Date(config.activity.startTime);
        const endTime = new Date(config.activity.endTime);
        
        if (now < startTime) {
            return res.status(400).json({
                success: false,
                error: '活动尚未开始'
            });
        }
        
        if (now > endTime) {
            return res.status(400).json({
                success: false,
                error: '活动已结束'
            });
        }
        
        // 读取用户数据
        let userData = await readJSON('lottery/users.json');
        if (!userData) {
            userData = {
                users: [],
                lastUpdated: new Date().toISOString()
            };
        }
        
        // 防刷检查
        const timeWindow = config.antiSpam.timeWindow * 1000; // 转换为毫秒
        const cutoffTime = now.getTime() - timeWindow;
        
        // 检查IP限制
        const ipCount = userData.users.filter(u => 
            u.ip === ip && new Date(u.submitTime).getTime() > cutoffTime
        ).length;
        
        if (ipCount >= config.antiSpam.ipLimit) {
            return res.status(429).json({
                success: false,
                error: '您已参与过本期活动'
            });
        }
        
        // 检查手机号限制
        const phoneCount = userData.users.filter(u => 
            u.phone === phone && new Date(u.submitTime).getTime() > cutoffTime
        ).length;
        
        if (phoneCount >= config.antiSpam.phoneLimit) {
            return res.status(429).json({
                success: false,
                error: '该手机号已参与过本期活动'
            });
        }
        
        // 创建用户记录
        const userId = `U${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const userRecord = {
            id: userId,
            name,
            phone,
            wechat: wechat || '',
            ip,
            submitTime: now.toISOString(),
            status: 'pending' // pending, winner, notWinner
        };
        
        // 添加到用户列表
        userData.users.push(userRecord);
        userData.lastUpdated = now.toISOString();
        
        // 保存到OSS
        await writeJSON('lottery/users.json', userData);
        
        return res.status(200).json({
            success: true,
            message: '提交成功！祝您好运！',
            userId
        });
        
    } catch (error) {
        console.error('提交失败:', error);
        return res.status(500).json({
            success: false,
            error: '提交失败，请稍后重试',
            message: error.message
        });
    }
}

