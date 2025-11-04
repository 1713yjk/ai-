// 获取用户列表API（需要管理员权限）
const { readJSON, verifyAdminPassword } = require('./oss-utils');

export default async function handler(req, res) {
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            error: '仅支持GET请求'
        });
    }
    
    try {
        // 验证管理员密码
        const password = req.headers['x-admin-password'] || req.query.password;
        
        if (!verifyAdminPassword(password)) {
            return res.status(401).json({
                success: false,
                error: '管理员密码错误'
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
        
        // 读取中奖数据
        let winnerData = await readJSON('lottery/winners.json');
        if (!winnerData) {
            winnerData = {
                winners: [],
                draws: []
            };
        }
        
        // 获取查询参数
        const { status, startDate, endDate, page = 1, pageSize = 50 } = req.query;
        
        // 过滤用户
        let filteredUsers = [...userData.users];
        
        if (status) {
            filteredUsers = filteredUsers.filter(u => u.status === status);
        }
        
        if (startDate) {
            const start = new Date(startDate);
            filteredUsers = filteredUsers.filter(u => new Date(u.submitTime) >= start);
        }
        
        if (endDate) {
            const end = new Date(endDate);
            filteredUsers = filteredUsers.filter(u => new Date(u.submitTime) <= end);
        }
        
        // 排序：按提交时间倒序
        filteredUsers.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));
        
        // 分页
        const total = filteredUsers.length;
        const totalPages = Math.ceil(total / pageSize);
        const currentPage = Math.min(Math.max(1, parseInt(page)), totalPages);
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + parseInt(pageSize);
        const paginatedUsers = filteredUsers.slice(startIndex, endIndex);
        
        // 统计数据
        const stats = {
            total: userData.users.length,
            pending: userData.users.filter(u => u.status === 'pending').length,
            winners: userData.users.filter(u => u.status === 'winner').length,
            notWinners: userData.users.filter(u => u.status === 'notWinner').length,
            totalDraws: winnerData.draws.length
        };
        
        return res.status(200).json({
            success: true,
            users: paginatedUsers,
            pagination: {
                currentPage,
                pageSize: parseInt(pageSize),
                total,
                totalPages
            },
            stats,
            lastUpdated: userData.lastUpdated
        });
        
    } catch (error) {
        console.error('获取列表失败:', error);
        return res.status(500).json({
            success: false,
            error: '获取数据失败',
            message: error.message
        });
    }
}

