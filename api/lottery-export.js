// 导出Excel API（需要管理员权限）
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
        const userData = await readJSON('lottery/users.json');
        if (!userData || !userData.users || userData.users.length === 0) {
            return res.status(404).json({
                success: false,
                error: '暂无数据'
            });
        }
        
        const { type = 'all' } = req.query;
        // type: 'all' 全部, 'winners' 仅中奖者, 'pending' 仅待抽奖
        
        let users = [...userData.users];
        
        if (type === 'winners') {
            users = users.filter(u => u.status === 'winner');
        } else if (type === 'pending') {
            users = users.filter(u => u.status === 'pending');
        }
        
        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                error: '暂无符合条件的数据'
            });
        }
        
        // 生成CSV格式（Excel可以打开）
        // 使用UTF-8 BOM以确保Excel正确识别中文
        const BOM = '\uFEFF';
        const headers = ['ID', '姓名', '手机号', '微信号', '提交时间', 'IP地址', '状态', '奖品等级', '奖品名称', '中奖时间'];
        const csvRows = [headers.join(',')];
        
        users.forEach(user => {
            const row = [
                user.id,
                user.name,
                user.phone,
                user.wechat || '',
                user.submitTime,
                user.ip,
                user.status === 'winner' ? '已中奖' : user.status === 'pending' ? '待抽奖' : '未中奖',
                user.prizeLevel || '',
                user.prizeName || '',
                user.winTime || ''
            ];
            // 处理包含逗号的字段
            const escapedRow = row.map(field => {
                const str = String(field);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            });
            csvRows.push(escapedRow.join(','));
        });
        
        const csvContent = BOM + csvRows.join('\n');
        
        // 设置响应头
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="lottery-export-${Date.now()}.csv"`);
        
        return res.status(200).send(csvContent);
        
    } catch (error) {
        console.error('导出失败:', error);
        return res.status(500).json({
            success: false,
            error: '导出失败',
            message: error.message
        });
    }
}

