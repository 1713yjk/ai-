// Vercel API Route for AI Chat
// 处理小程序AI对话请求，支持多轮对话

/**
 * 构建消息内容（支持多模态）
 * @param {Object} message - 消息对象
 * @returns {String|Array} 文本内容或多模态内容数组
 */
function buildMessageContent(message) {
    // 如果消息没有附件，返回纯文本
    if (!message.attachments || message.attachments.length === 0) {
        return message.content;
    }
    
    // 如果有附件，构建多模态content数组
    const contentArray = [];
    
    // 添加文本内容（如果有）
    if (message.content && message.content.trim()) {
        contentArray.push({
            type: 'text',
            text: message.content
        });
    }
    
    // 添加附件内容
    message.attachments.forEach(attachment => {
        if (attachment.category === 'image') {
            contentArray.push({
                type: 'image_url',
                image_url: attachment.url
            });
        } else if (attachment.category === 'document') {
            // 文档类型：添加提示文本
            contentArray.push({
                type: 'text',
                text: `[用户上传了文档: ${attachment.filename}]`
            });
        }
    });
    
    return contentArray;
}

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
        const { messages, stream = false, hasAttachments = false } = req.body;
        
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
        
        // 从环境变量获取API密钥和应用ID
        const API_KEY = process.env.BAILIAN_API_KEY || 'sk-9c3ff6da6d7a4278adb0906afb7bf556';
        const APP_ID = process.env.BAILIAN_APP_ID || '25169679aff34de39aa146e63db8aaeb';
        
        // 构建百炼应用API请求（使用您配置的应用，包含内置提示词）
        const bailianRequest = {
            input: {
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: buildMessageContent(msg)
                }))
            },
            parameters: {},
            debug: {}
        };
        
        console.log('[AI Chat] 开始调用百炼应用API...');
        console.log(`[AI Chat] 应用ID: ${APP_ID}`);
        console.log(`[AI Chat] 对话轮次: ${messages.length}`);
        console.log(`[AI Chat] 包含附件: ${hasAttachments}`);
        if (hasAttachments) {
            const attachmentCount = messages.reduce((count, msg) => 
                count + (msg.attachments?.length || 0), 0);
            console.log(`[AI Chat] 附件总数: ${attachmentCount}`);
        }
        
        // 调用百炼应用API（会使用应用配置的提示词）
        const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/apps/${APP_ID}/completion`, {
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
        
        // 解析百炼应用API响应
        const bailianResponse = await response.json();
        
        // 提取AI回复内容（百炼应用API格式）
        const aiContent = bailianResponse.output?.text || 
                         bailianResponse.output?.choices?.[0]?.message?.content || 
                         '';
        
        if (!aiContent) {
            console.error('[AI Chat] 无法从响应中提取AI内容');
            console.error('[AI Chat] 响应数据:', JSON.stringify(bailianResponse));
            
            return res.status(500).json({
                success: false,
                error: 'Invalid response',
                message: '百炼应用API响应格式异常'
            });
        }
        
        console.log(`[AI Chat] 百炼应用API调用成功，返回内容长度: ${aiContent.length} 字符`);
        console.log('[AI Chat] ✅ 已使用您配置的应用提示词');
        
        // 返回标准格式响应（兼容小程序端的多种格式）
        return res.status(200).json({
            success: true,
            data: {
                content: aiContent,
                usage: bailianResponse.usage || {},
                model: 'bailian-app'
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

