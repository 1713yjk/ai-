// Vercel API Route for Bailian AI Proxy
// 处理前端到阿里云百炼AI的代理请求，解决CORS问题

export default async function handler(req, res) {
    console.log(`[${new Date().toISOString()}] 收到请求: ${req.method} ${req.url}`);
    
    // 设置CORS头 - 允许所有来源访问
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
            error: 'Method not allowed',
            message: '只支持POST请求'
        });
    }
    
    try {
        // 提取请求体中的prompt参数
        const { prompt } = req.body;
        
        if (!prompt) {
            console.log('[ERROR] 缺少prompt参数');
            return res.status(400).json({
                error: 'Missing parameter',
                message: '请提供prompt参数'
            });
        }
        
        console.log(`[AI] 收到prompt长度: ${prompt.length} 字符`);
        console.log(`[AI] prompt预览: ${prompt.substring(0, 100)}...`);
        
        // 从环境变量获取API密钥（更安全）
        const API_KEY = process.env.BAILIAN_API_KEY || 'sk-9c3ff6da6d7a4278adb0906afb7bf556';
        
        // 构建百炼API请求
        const bailianRequest = {
            model: 'qwen-turbo',
            input: {
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            },
            parameters: {
                temperature: 0.7,
                top_p: 0.8,
                max_tokens: 2000
            }
        };
        
        console.log('[AI] 开始调用百炼API...');
        
        // 调用百炼API
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(bailianRequest)
        });
        
        console.log(`[AI] 百炼API响应状态: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AI] 百炼API错误: ${response.status} - ${errorText}`);
            
            return res.status(response.status).json({
                error: 'Bailian API error',
                message: `百炼API返回错误: ${response.status}`,
                details: errorText
            });
        }
        
        // 解析百炼API响应
        const bailianResponse = await response.json();
        console.log('[AI] 百炼API调用成功');
        
        // 返回成功响应
        return res.status(200).json(bailianResponse);
        
    } catch (error) {
        console.error('[ERROR] 服务器内部错误:', error);
        
        return res.status(500).json({
            error: 'Internal server error',
            message: '服务器处理请求时发生错误',
            details: error.message
        });
    }
}
