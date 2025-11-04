const jwt = require('jsonwebtoken');
const { query } = require('../utils/db');

function verifyToken(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new Error('未提供token');
  return jwt.verify(token, process.env.JWT_SECRET);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: '只支持GET请求' });
  }
  
  try {
    const decoded = verifyToken(req);
    const userId = decoded.userId;
    
    const { testType, limit = 50, offset = 0 } = req.query;
    
    let sql = 'SELECT * FROM health_records WHERE user_id = ?';
    let params = [userId];
    
    if (testType) {
      sql += ' AND test_type = ?';
      params.push(testType);
    }
    
    sql += ' ORDER BY test_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const records = await query(sql, params);
    
    const formattedRecords = records.map(r => ({
      id: r.record_id,
      testType: r.test_type,
      testName: r.test_name,
      date: r.test_date,
      timestamp: new Date(r.test_date).getTime(),
      answers: JSON.parse(r.answers || '[]'),
      result: JSON.parse(r.result || '{}')
    }));
    
    return res.status(200).json({
      success: true,
      data: {
        records: formattedRecords,
        total: formattedRecords.length
      }
    });
    
  } catch (error) {
    console.error('[Health] 查询错误:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'token无效' });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: '服务器错误'
    });
  }
}

