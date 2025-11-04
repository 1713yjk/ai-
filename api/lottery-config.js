// 抽奖配置管理API
const { readJSON, writeJSON, verifyAdminPassword } = require('./oss-utils');

export default async function handler(req, res) {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const configPath = 'lottery/config.json';
    
    try {
        // GET - 获取配置（公开接口）
        if (req.method === 'GET') {
            let config = await readJSON(configPath);
            
            // 如果配置不存在，返回默认配置
            if (!config) {
                config = {
                    activity: {
                        title: "AZ Ring 抽奖活动",
                        description: "参与即有机会赢取AZ Ring智能戒指等豪礼！",
                        startTime: "2025-01-20 00:00:00",
                        endTime: "2025-12-31 23:59:59",
                        drawDay: "每周五",
                        status: "active"
                    },
                    prizes: {
                        first: {
                            name: "AZ Ring智能戒指",
                            count: 1,
                            description: "价值999元"
                        },
                        second: {
                            name: "健康大礼包",
                            count: 5,
                            description: "价值299元"
                        },
                        third: {
                            name: "精美礼品",
                            count: 20,
                            description: "价值99元"
                        }
                    },
                    form: {
                        fields: ["name", "phone", "wechat"],
                        required: ["name", "phone"]
                    },
                    antiSpam: {
                        ipLimit: 1,
                        phoneLimit: 1,
                        timeWindow: 604800
                    }
                };
            }
            
            return res.status(200).json({
                success: true,
                config
            });
        }
        
        // POST - 更新配置（需要管理员密码）
        if (req.method === 'POST') {
            const password = req.headers['x-admin-password'] || req.body.password;
            
            if (!verifyAdminPassword(password)) {
                return res.status(401).json({
                    success: false,
                    error: '管理员密码错误'
                });
            }
            
            const newConfig = req.body.config;
            if (!newConfig) {
                return res.status(400).json({
                    success: false,
                    error: '缺少配置数据'
                });
            }
            
            // 保存配置
            await writeJSON(configPath, newConfig);
            
            return res.status(200).json({
                success: true,
                message: '配置已更新',
                config: newConfig
            });
        }
        
        return res.status(405).json({
            success: false,
            error: '不支持的请求方法'
        });
        
    } catch (error) {
        console.error('配置管理错误:', error);
        return res.status(500).json({
            success: false,
            error: '服务器错误',
            message: error.message
        });
    }
}

