const config = require('../../config');

/**
 * خدمة الذكاء الاصطناعي للاستشارة الذكية باستخدام OpenAI API
 */

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * دالة مساعدة لإرسال الطلب إلى OpenAI مع دعم timeout
 */
const callOpenAI = async (messages, { jsonMode = true, temperature = 0.7, maxTokens = 1500 } = {}) => {
  const apiKey = config.openai?.apiKey;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY غير متوفر في الإعدادات');
  }

  const model = config.openai?.model || 'gpt-4o-mini';

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 ثانية مهلة

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errBody = await res.text();
      console.error('❌ OpenAI API Error Response:', errBody);
      throw new Error(`OpenAI API request failed with status ${res.status}: ${errBody}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('لم يتم استلام أي محتوى من نموذج OpenAI');
    }

    if (jsonMode) {
      return JSON.parse(content);
    }

    return content;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
};

/**
 * توليد الرسالة الافتتاحية والملخص المبدئي عند إنشاء جلسة استشارة جديدة
 */
const generateInitialConsultationAI = async ({ initialIdea, projectType, title }) => {
  try {
    const systemPrompt = `أنت "المستشار التقني الذكي" لمنصة ACCESS (منصة سعودية رائدة لربط أصحاب الأعمال والمشاريع بفرق تقنية ومستقلين محترفين).
مهمتك:
1. الترحيب بالعميل بأسلوب تقني مهني، مشجع وودود باللغة العربية.
2. تقديم رد أولي مخصص بناءً على الفكرة الأولية التي شاركها العميل، وتحديد النقاط المحورية للمشروع.
3. اقتراح 4 خيارات تفاعلية سريعة (Suggestions) تساعد العميل على إكمال الحديث وتفصيل نطاق العمل.
4. استنتاج مسودة أولية للملخص الحي (Live Brief).

يجب أن يكون الرد بتنسيق JSON حصراً على النحو التالي:
{
  "greeting": "نص الترحيب والتحليل المبدئي للفكرة باللغة العربية",
  "suggestions": ["اقتراح 1", "اقتراح 2", "اقتراح 3", "اقتراح 4"],
  "brief": {
    "title": "عنوان جذاب ومناسب للمشروع",
    "project_type": "نوع المشروع (مثال: متجر إلكتروني، تطبيق جوال، منصة ويب)",
    "summary": "ملخص واضح ومختصر للفكرة ونطاقها",
    "target_audience": ["الفئة المستهدفة 1", "الفئة المستهدفة 2"],
    "features": ["الميزة الأساسية 1", "الميزة الأساسية 2", "الميزة الأساسية 3"],
    "suggested_technologies": ["تقنية 1", "تقنية 2"],
    "min_budget": 8000,
    "max_budget": 15000,
    "min_duration_weeks": 3,
    "max_duration_weeks": 5,
    "estimated_cost": 12000,
    "estimated_duration": "3-5 أسابيع"
  }
}`;

    const userPrompt = `فكرة المشروع الأولية: "${initialIdea || 'مشروع جديد قيد التخطيط'}"
النوع المقترح: "${projectType || 'غير محدد'}"
العنوان المقترح: "${title || 'مشروع تقني جديد'}"`;

    const result = await callOpenAI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    return result;
  } catch (error) {
    console.error('⚠️ تحذير: تعذر استخدام OpenAI في الترحيب الأولي، سيتم استخدام الرد الافتراضي:', error.message);
    return null;
  }
};

/**
 * معالجة رسالة العميل عبر الذكاء الاصطناعي وتوليد الرد وتحديث الملخص الحي
 */
const processConsultationChatAI = async ({ consultation, conversationHistory = [], newMessage }) => {
  try {
    const systemPrompt = `أنت "المستشار الذكي" لمنصة ACCESS، خبير هندسة برمجيات وإدارة منتجات تقنية (Product Manager & Solutions Architect) بخبرة واسعة في السوق السعودي والخليجي.
دورك:
1. الإجابة على استفسارات العميل وتوجيهه خطوة بخطوة لبناء وتفصيل متطلبات مشروعه.
2. تقديم نصائح هندسية وتقنية دقيقة (اختيار التقنيات، بوابات الدفع، البنية التحتية، تجربة المستخدم).
3. تقدير التكلفة والمدة الزمنية الواقعية بالريال السعودي (ر.س).
4. تحديث "الملخص الحي" للمشروع باستمرار مع كل رسالة جديدة ليعكس أحدث ما تم الاتفاق عليه أو مناقشته.
5. تقديم 3 إلى 4 اقتراحات سريعة (Suggestions) تدفع المحادثة للأمام (مثل اقتراح بوابات دفع محلية مثل Mada/Tabby، أو مناقشة لوحة التحكم، أو الانتقال لتوليد العقد).

يجب أن يكون الرد بتنسيق JSON حصراً على النحو التالي:
{
  "reply": "نص الرد العربي المفصل والذكي والمشجع للعميل",
  "suggestions": ["اقتراح 1", "اقتراح 2", "اقتراح 3"],
  "updated_brief": {
    "title": "عنوان المشروع المحدث",
    "project_type": "نوع المشروع",
    "summary": "الملخص المحدث بناءً على ما ذكره العميل",
    "target_audience": ["فئة 1", "فئة 2"],
    "features": ["ميزة 1", "ميزة 2", "ميزة 3", "ميزة 4"],
    "suggested_technologies": ["تقنية 1", "تقنية 2", "تقنية 3"],
    "min_budget": 10000,
    "max_budget": 20000,
    "min_duration_weeks": 4,
    "max_duration_weeks": 8,
    "estimated_cost": 15000,
    "estimated_duration": "4-6 أسابيع"
  }
}`;

    // تجميع سياق الملخص الحالي
    const currentBriefContext = {
      title: consultation.title,
      project_type: consultation.project_type,
      summary: consultation.summary,
      target_audience: consultation.target_audience,
      features: consultation.features,
      suggested_technologies: consultation.suggested_technologies,
      min_budget: consultation.min_budget,
      max_budget: consultation.max_budget,
      min_duration_weeks: consultation.min_duration_weeks,
      max_duration_weeks: consultation.max_duration_weeks,
      estimated_cost: consultation.estimated_cost,
      estimated_duration: consultation.estimated_duration,
    };

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'system',
        content: `الحالة الحالية للملخص الحي للمشروع:\n${JSON.stringify(currentBriefContext, null, 2)}`,
      },
    ];

    // إضافة آخر 10 رسائل من سجل المحادثة لتوفير السياق
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.sender === 'assistant' ? 'assistant' : 'user',
        content: msg.message,
      });
    }

    // إضافة الرسالة الحالية للعميل
    messages.push({
      role: 'user',
      content: newMessage,
    });

    const aiResult = await callOpenAI(messages, { temperature: 0.65 });
    return aiResult;
  } catch (error) {
    console.error('⚠️ تحذير: فشل استدعاء OpenAI أثناء المحادثة، سيتم الرجوع للرد الاحتياطي الذكي:', error.message);
    return null;
  }
};

module.exports = {
  callOpenAI,
  generateInitialConsultationAI,
  processConsultationChatAI,
};
