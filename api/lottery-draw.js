// 执行抽奖API（需要管理员权限）
const { readJSON, writeJSON, verifyAdminPassword } = require('./oss-utils');

export default async function handler(req, res) {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
    
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
        // 验证管理员密码
        const password = req.headers['x-admin-password'] || req.body.password;
        
        if (!verifyAdminPassword(password)) {
            return res.status(401).json({
                success: false,
                error: '管理员密码错误'
            });
        }
        
        const { mode, prizeLevel, count, manualUserIds } = req.body;
        
        // mode: 'auto' 自动抽奖, 'manual' 手动指定中奖者
        // prizeLevel: 'first', 'second', 'third'
        // count: 抽取人数（自动模式）
        // manualUserIds: 手动指定的用户ID数组（手动模式）
        
        if (!mode || !prizeLevel) {
            return res.status(400).json({
                success: false,
                error: '缺少必要参数'
            });
        }
        
        // 读取数据
        const config = await readJSON('lottery/config.json');
        const userData = await readJSON('lottery/users.json');
        let winnerData = await readJSON('lottery/winners.json');
        
        if (!config || !userData) {
            return res.status(500).json({
                success: false,
                error: '数据未初始化'
            });
        }
        
        if (!winnerData) {
            winnerData = {
                winners: [],
                draws: []
            };
        }
        
        // 获取奖品配置
        const prize = config.prizes[prizeLevel];
        if (!prize) {
            return res.status(400).json({
                success: false,
                error: '无效的奖品等级'
            });
        }
        
        let selectedUsers = [];
        
        if (mode === 'auto') {
            // 自动抽奖
            const drawCount = count || prize.count;
            
            // 获取所有待抽奖用户（status为pending）
            const eligibleUsers = userData.users.filter(u => u.status === 'pending');
            
            if (eligibleUsers.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: '没有可抽奖的用户'
                });
            }
            
            if (eligibleUsers.length < drawCount) {
                return res.status(400).json({
                    success: false,
                    error: `可抽奖用户不足，当前只有 ${eligibleUsers.length} 人`
                });
            }
            
            // 随机抽取
            const shuffled = [...eligibleUsers].sort(() => Math.random() - 0.5);
            selectedUsers = shuffled.slice(0, drawCount);
            
        } else if (mode === 'manual') {
            // 手动指定中奖者
            if (!manualUserIds || !Array.isArray(manualUserIds) || manualUserIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: '未指定中奖用户'
                });
            }
            
            selectedUsers = userData.users.filter(u => 
                manualUserIds.includes(u.id) && u.status === 'pending'
            );
            
            if (selectedUsers.length !== manualUserIds.length) {
                return res.status(400).json({
                    success: false,
                    error: '部分用户不存在或已参与过抽奖'
                });
            }
            
        } else {
            return res.status(400).json({
                success: false,
                error: '无效的抽奖模式'
            });
        }
        
        // 创建抽奖记录
        const drawId = `D${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const drawRecord = {
            id: drawId,
            prizeLevel,
            prizeName: prize.name,
            mode,
            count: selectedUsers.length,
            drawTime: new Date().toISOString(),
            winners: selectedUsers.map(u => u.id)
        };
        
        // 更新用户状态为winner
        selectedUsers.forEach(winner => {
            const userIndex = userData.users.findIndex(u => u.id === winner.id);
            if (userIndex !== -1) {
                userData.users[userIndex].status = 'winner';
                userData.users[userIndex].prizeLevel = prizeLevel;
                userData.users[userIndex].prizeName = prize.name;
                userData.users[userIndex].drawId = drawId;
                userData.users[userIndex].winTime = new Date().toISOString();
            }
            
            // 添加到中奖者列表
            winnerData.winners.push({
                ...winner,
                prizeLevel,
                prizeName: prize.name,
                drawId,
                winTime: new Date().toISOString()
            });
        });
        
        // 添加抽奖记录
        winnerData.draws.push(drawRecord);
        
        // 保存数据
        userData.lastUpdated = new Date().toISOString();
        await writeJSON('lottery/users.json', userData);
        await writeJSON('lottery/winners.json', winnerData);
        
        return res.status(200).json({
            success: true,
            message: `成功抽取 ${selectedUsers.length} 位中奖者`,
            draw: drawRecord,
            winners: selectedUsers.map(u => ({
                id: u.id,
                name: u.name,
                phone: u.phone,
                wechat: u.wechat
            }))
        });
        
    } catch (error) {
        console.error('抽奖失败:', error);
        return res.status(500).json({
            success: false,
            error: '抽奖失败',
            message: error.message
        });
    }
}

