// OSS工具类 - 用于读写阿里云OSS
const OSS = require('ali-oss');

// 创建OSS客户端
function createOSSClient() {
    return new OSS({
        region: process.env.OSS_REGION || 'oss-cn-hangzhou',
        accessKeyId: process.env.OSS_ACCESS_KEY_ID,
        accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
        bucket: process.env.OSS_BUCKET || 'azlg-website1'
    });
}

// 读取JSON文件
async function readJSON(path) {
    try {
        const client = createOSSClient();
        const result = await client.get(path);
        const content = result.content.toString();
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'NoSuchKey') {
            console.log(`文件不存在: ${path}，返回空数据`);
            return null;
        }
        throw error;
    }
}

// 写入JSON文件
async function writeJSON(path, data) {
    const client = createOSSClient();
    const content = JSON.stringify(data, null, 2);
    await client.put(path, Buffer.from(content));
}

// 验证管理员密码
function verifyAdminPassword(password) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'bycx2025';
    return password === adminPassword;
}

// 获取IP地址
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           'unknown';
}

module.exports = {
    readJSON,
    writeJSON,
    verifyAdminPassword,
    getClientIP
};

