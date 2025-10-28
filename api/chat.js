// Vercel API Route for AI Chat
// 处理小程序AI对话请求，支持多轮对话

export default async function handler(req, res) {
    console.log(`[${new Date().toISOString()}] 收到AI对话请求: ${req.method} ${req.url}`);
    
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
            success: false,
            error: 'Method not allowed',
            message: '只支持POST请求'
        });
    }
    
    try {
        // 提取请求体中的messages参数
        const { messages, stream = false } = req.body;
        
        // 参数验证
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            console.log('[ERROR] 缺少messages参数或格式错误');
            return res.status(400).json({
                success: false,
                error: 'Missing parameter',
                message: '请提供messages参数（数组格式）'
            });
        }
        
        console.log(`[AI Chat] 收到对话历史: ${messages.length} 条消息`);
        console.log(`[AI Chat] 最新消息: ${messages[messages.length - 1]?.content?.substring(0, 50)}...`);
        
        // 从环境变量获取API密钥（更安全）
        const API_KEY = process.env.BAILIAN_API_KEY || 'sk-9c3ff6da6d7a4278adb0906afb7bf556';
        
        // 构建百炼API请求（支持多轮对话）
        const bailianRequest = {
            model: 'qwen-plus', // 使用 qwen-plus 获得更好的对话质量
            input: {
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            },
            parameters: {
                temperature: 0.7,
                top_p: 0.8,
                max_tokens: 2000,
                result_format: 'message' // 使用message格式便于解析
            }
        };
        
        console.log('[AI Chat] 开始调用百炼API...');
        console.log(`[AI Chat] 使用模型: ${bailianRequest.model}`);
        
        // 调用百炼API
        const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'X-DashScope-SSE': 'disable' // 禁用流式输出
            },
            body: JSON.stringify(bailianRequest)
        });
        
        console.log(`[AI Chat] 百炼API响应状态: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[AI Chat] 百炼API错误: ${response.status} - ${errorText}`);
            
            return res.status(response.status).json({
                success: false,
                error: 'Bailian API error',
                message: `百炼API返回错误: ${response.status}`,
                details: errorText
            });
        }
        
        // 解析百炼API响应
        const bailianResponse = await response.json();
        
        // 提取AI回复内容
        const aiContent = bailianResponse.output?.choices?.[0]?.message?.content || 
                         bailianResponse.output?.text || 
                         '';
        
        if (!aiContent) {
            console.error('[AI Chat] 无法从响应中提取AI内容');
            console.error('[AI Chat] 响应数据:', JSON.stringify(bailianResponse));
            
            return res.status(500).json({
                success: false,
                error: 'Invalid response',
                message: '百炼API响应格式异常'
            });
        }
        
        console.log(`[AI Chat] 百炼API调用成功，返回内容长度: ${aiContent.length} 字符`);
        
        // 返回标准格式响应（兼容小程序端的多种格式）
        return res.status(200).json({
            success: true,
            data: {
                content: aiContent,
                usage: bailianResponse.usage || {},
                model: bailianRequest.model
            },
            // 额外兼容字段
            content: aiContent,
            output: bailianResponse.output
        });
        
    } catch (error) {
        console.error('[ERROR] 服务器内部错误:', error);
        console.error('[ERROR] 错误堆栈:', error.stack);
        
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: '服务器处理请求时发生错误',
            details: error.message
        });
    }
}

