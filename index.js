const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');
require('dotenv').config();

// التحقق من وجود المتغيرات البيئية المطلوبة
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('❌ خطأ: TELEGRAM_BOT_TOKEN غير موجود في متغيرات البيئة');
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ خطأ: OPENAI_API_KEY غير موجود في متغيرات البيئة');
    process.exit(1);
}

// إعداد البوت
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// إعداد OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// النموذج المستخدم
const MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

// رسائل النظام
const SYSTEM_MESSAGE = {
    role: 'system',
    content: 'أنت مساعد ذكي ومفيد. أجب على الأسئلة بطريقة واضحة ومفيدة باللغة العربية.'
};

// تخزين محادثات المستخدمين (في الإنتاج، استخدم قاعدة بيانات)
const userConversations = new Map();

// دالة للحصول على محادثة المستخدم
function getUserConversation(userId) {
    if (!userConversations.has(userId)) {
        userConversations.set(userId, [SYSTEM_MESSAGE]);
    }
    return userConversations.get(userId);
}

// دالة لإضافة رسالة إلى محادثة المستخدم
function addMessageToConversation(userId, role, content) {
    const conversation = getUserConversation(userId);
    conversation.push({ role, content });
    
    // الحفاظ على آخر 20 رسالة لتجنب تجاوز حد الرموز
    if (conversation.length > 21) { // +1 للرسالة النظام
        conversation.splice(1, conversation.length - 21);
    }
}

// دالة للحصول على رد من OpenAI
async function getOpenAIResponse(userId, userMessage) {
    try {
        // إضافة رسالة المستخدم
        addMessageToConversation(userId, 'user', userMessage);
        
        const conversation = getUserConversation(userId);
        
        const response = await openai.chat.completions.create({
            model: MODEL,
            messages: conversation,
            max_tokens: 1000,
            temperature: 0.7,
        });

        const assistantMessage = response.choices[0].message.content;
        
        // إضافة رد المساعد
        addMessageToConversation(userId, 'assistant', assistantMessage);
        
        return assistantMessage;
    } catch (error) {
        console.error('خطأ في OpenAI:', error);
        
        if (error.code === 'insufficient_quota') {
            return 'عذراً، تم استنفاد رصيد OpenAI API. يرجى التحقق من حسابك.';
        } else if (error.code === 'invalid_api_key') {
            return 'عذراً، مفتاح OpenAI API غير صحيح.';
        } else {
            return 'عذراً، حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.';
        }
    }
}

// معالج أمر /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = `
🤖 مرحباً بك في البوت الذكي!

أنا بوت يستخدم تقنية OpenAI للإجابة على أسئلتك ومساعدتك في مختلف المواضيع.

📝 الأوامر المتاحة:
/start - عرض هذه الرسالة
/help - عرض المساعدة
/clear - مسح المحادثة الحالية
/info - معلومات عن البوت

💬 أرسل لي أي سؤال أو رسالة وسأجيب عليك!
    `;
    
    bot.sendMessage(chatId, welcomeMessage);
});

// معالج أمر /help
bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    const helpMessage = `
📖 كيفية استخدام البوت:

1️⃣ أرسل أي سؤال أو رسالة نصية
2️⃣ انتظر الرد من البوت
3️⃣ يمكنك الاستمرار في المحادثة

🔧 الأوامر:
/start - البداية
/help - المساعدة
/clear - مسح المحادثة
/info - معلومات البوت

💡 نصائح:
• يمكنك طرح أسئلة معقدة
• البوت يتذكر سياق المحادثة
• استخدم /clear لبدء محادثة جديدة
    `;
    
    bot.sendMessage(chatId, helpMessage);
});

// معالج أمر /clear
bot.onText(/\/clear/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // مسح محادثة المستخدم
    userConversations.delete(userId);
    
    bot.sendMessage(chatId, '🗑️ تم مسح المحادثة بنجاح! يمكنك البدء بمحادثة جديدة.');
});

// معالج أمر /info
bot.onText(/\/info/, (msg) => {
    const chatId = msg.chat.id;
    const infoMessage = `
ℹ️ معلومات عن البوت:

🤖 النوع: بوت ذكي يستخدم OpenAI
🧠 النموذج: ${MODEL}
💻 التقنية: Node.js + Telegram Bot API
🌐 الاستضافة: Render

👨‍💻 المطور: [اسمك هنا]
📅 تاريخ الإنشاء: ${new Date().toLocaleDateString('ar-SA')}

🔒 الخصوصية: 
• لا يتم حفظ المحادثات بشكل دائم
• البيانات آمنة ومشفرة
    `;
    
    bot.sendMessage(chatId, infoMessage);
});

// معالج الرسائل النصية
bot.on('message', async (msg) => {
    // تجاهل الأوامر
    if (msg.text && msg.text.startsWith('/')) {
        return;
    }
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userMessage = msg.text;
    
    // التحقق من وجود نص في الرسالة
    if (!userMessage) {
        bot.sendMessage(chatId, '📝 يرجى إرسال رسالة نصية للحصول على رد.');
        return;
    }
    
    // إرسال مؤشر الكتابة
    bot.sendChatAction(chatId, 'typing');
    
    try {
        // الحصول على رد من OpenAI
        const response = await getOpenAIResponse(userId, userMessage);
        
        // إرسال الرد
        bot.sendMessage(chatId, response);
        
    } catch (error) {
        console.error('خطأ في معالجة الرسالة:', error);
        bot.sendMessage(chatId, 'عذراً، حدث خطأ أثناء معالجة رسالتك. يرجى المحاولة مرة أخرى.');
    }
});

// معالج الأخطاء
bot.on('error', (error) => {
    console.error('خطأ في البوت:', error);
});

// معالج إيقاف البوت
process.on('SIGINT', () => {
    console.log('🛑 إيقاف البوت...');
    bot.stopPolling();
    process.exit(0);
});

// بدء البوت
console.log('🚀 تم بدء تشغيل البوت بنجاح!');
console.log(`📱 النموذج المستخدم: ${MODEL}`);
console.log('⏳ في انتظار الرسائل...');

// إعداد خادم بسيط للاستضافة على Render
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.json({
        status: 'البوت يعمل بنجاح! ✅',
        timestamp: new Date().toISOString(),
        model: MODEL
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', uptime: process.uptime() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 الخادم يعمل على المنفذ ${PORT}`);
});

