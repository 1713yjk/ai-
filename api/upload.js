// Vercel API Route for File Upload
// 处理小程序附件上传，支持图片和文档

const OSS = require('ali-oss');
const { v4: uuidv4 } = require('uuid');
const Busboy = require('busboy');

// 禁用Vercel的body解析，我们需要手动处理
export const config = {
  api: {
    bodyParser: false,
  },
};

// 环境变量
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-hangzhou';
const OSS_BUCKET = process.env.OSS_BUCKET || 'azlg-website1';
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID;
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET;
const TEMP_FILE_EXPIRE_HOURS = parseInt(process.env.TEMP_FILE_EXPIRE_HOURS || '24');

// 文件类型白名单
const ALLOWED_MIME_TYPES = {
  'image/jpeg': { ext: 'jpg', category: 'image' },
  'image/png': { ext: 'png', category: 'image' },
  'application/pdf': { ext: 'pdf', category: 'document' },
  'application/msword': { ext: 'doc', category: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', category: 'document' }
};

// 文件大小限制 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 主处理函数
 */
export default async function handler(req, res) {
  console.log(`[${new Date().toISOString()}] 收到文件上传请求: ${req.method} ${req.url}`);
  
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  // 处理OPTIONS预检请求
  if (req.method === 'OPTIONS') {
    console.log('[CORS] 处理OPTIONS预检请求');
    return res.status(200).end();
  }
  
  // 只允许POST请求
  if (req.method !== 'POST') {
    console.log(`[ERROR] 不支持的请求方法: ${req.method}`);
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: '只支持POST请求'
    });
  }
  
  try {
    // 解析multipart/form-data
    console.log('[Upload] 开始解析文件...');
    const { file, filename, mimeType } = await parseMultipartForm(req);
    
    console.log(`[Upload] 文件信息: ${filename}, ${mimeType}, ${file.length} bytes`);
    
    // 验证文件
    validateFile(file, mimeType, filename);
    
    // 上传到OSS
    console.log('[Upload] 开始上传到OSS...');
    const uploadResult = await uploadToOSS(file, filename, mimeType);
    
    console.log(`[Upload] ✅ 上传成功: ${uploadResult.fileId}`);
    
    // 返回成功响应
    return res.status(200).json({
      success: true,
      data: uploadResult
    });
    
  } catch (error) {
    console.error('[ERROR] 文件上传失败:', error);
    console.error('[ERROR] 错误堆栈:', error.stack);
    
    // 根据错误类型返回不同状态码
    if (error.message.includes('文件类型')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: error.message
      });
    }
    
    if (error.message.includes('文件大小')) {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: error.message
      });
    }
    
    if (error.message.includes('OSS')) {
      return res.status(500).json({
        success: false,
        error: 'Upload failed',
        message: 'OSS上传失败，请稍后重试',
        details: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: '服务器处理请求时发生错误',
      details: error.message
    });
  }
}

/**
 * 使用busboy解析multipart/form-data格式的文件
 * @param {Object} req - 请求对象
 * @returns {Promise<Object>} { file: Buffer, filename: string, mimeType: string }
 */
async function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    
    let fileBuffer = null;
    let filename = null;
    let mimeType = null;
    let formData = {};
    
    // 监听文件字段
    busboy.on('file', (fieldname, file, info) => {
      filename = info.filename || 'unnamed';
      mimeType = info.mimeType || 'application/octet-stream';
      
      const chunks = [];
      let fileSize = 0;
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
        fileSize += chunk.length;
        
        // 检查文件大小
        if (fileSize > MAX_FILE_SIZE) {
          file.resume(); // 丢弃剩余数据
          reject(new Error(`文件大小超过限制（最大${MAX_FILE_SIZE / 1024 / 1024}MB）`));
        }
      });
      
      file.on('end', () => {
        if (fileSize <= MAX_FILE_SIZE) {
          fileBuffer = Buffer.concat(chunks);
        }
      });
      
      file.on('error', (error) => {
        reject(error);
      });
    });
    
    // 监听普通表单字段
    busboy.on('field', (fieldname, value) => {
      formData[fieldname] = value;
    });
    
    // 解析完成
    busboy.on('finish', () => {
      if (!fileBuffer) {
        reject(new Error('未找到文件数据'));
        return;
      }
      
      // 如果formData中有filename，优先使用（小程序传的）
      if (formData.filename) {
        filename = formData.filename;
      }
      
      resolve({ file: fileBuffer, filename, mimeType });
    });
    
    // 错误处理
    busboy.on('error', (error) => {
      reject(error);
    });
    
    // 将请求流传入busboy
    req.pipe(busboy);
  });
}

/**
 * 验证文件
 * @param {Buffer} file - 文件数据
 * @param {String} mimeType - MIME类型
 * @param {String} filename - 文件名
 */
function validateFile(file, mimeType, filename) {
  // 检查MIME类型
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    throw new Error(`不支持的文件类型: ${mimeType}。只支持图片(jpg/png)和文档(pdf/doc/docx)`);
  }
  
  // 检查文件大小
  if (file.length > MAX_FILE_SIZE) {
    const sizeMB = (file.length / 1024 / 1024).toFixed(2);
    throw new Error(`文件大小(${sizeMB}MB)超过限制(10MB)`);
  }
  
  console.log(`[Validate] ✅ 文件验证通过: ${filename}`);
}

/**
 * 上传文件到OSS
 * @param {Buffer} fileBuffer - 文件数据
 * @param {String} originalFilename - 原始文件名
 * @param {String} mimeType - MIME类型
 * @returns {Promise<Object>} 上传结果
 */
async function uploadToOSS(fileBuffer, originalFilename, mimeType) {
  // 检查OSS配置
  if (!OSS_ACCESS_KEY_ID || !OSS_ACCESS_KEY_SECRET) {
    throw new Error('OSS配置缺失，请检查环境变量');
  }
  
  // 创建OSS客户端
  const client = new OSS({
    region: OSS_REGION,
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
    bucket: OSS_BUCKET
  });
  
  // 获取文件信息
  const { ext, category } = ALLOWED_MIME_TYPES[mimeType];
  
  // 生成唯一文件名
  const fileId = uuidv4();
  const newFilename = `${fileId}.${ext}`;
  
  // 构建OSS路径：temp/ai-attachments/YYYY-MM-DD/filename
  const now = new Date();
  const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const ossPath = `temp/ai-attachments/${dateFolder}/${newFilename}`;
  
  console.log(`[OSS] 上传路径: ${ossPath}`);
  
  try {
    // 上传文件
    const result = await client.put(ossPath, fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache'
      }
    });
    
    console.log(`[OSS] ✅ 上传成功: ${result.url}`);
    
    // 生成临时签名URL（24小时有效）
    const expireSeconds = TEMP_FILE_EXPIRE_HOURS * 3600;
    const signedUrl = client.signatureUrl(ossPath, {
      expires: expireSeconds
    });
    
    // 计算过期时间戳
    const expireTime = Date.now() + (expireSeconds * 1000);
    
    console.log(`[OSS] 签名URL有效期: ${TEMP_FILE_EXPIRE_HOURS}小时`);
    
    return {
      fileId: fileId,
      url: signedUrl,
      filename: originalFilename,
      size: fileBuffer.length,
      mimeType: mimeType,
      category: category,
      expireTime: expireTime
    };
    
  } catch (error) {
    console.error('[OSS] ❌ 上传失败:', error);
    throw new Error(`OSS上传失败: ${error.message}`);
  }
}

