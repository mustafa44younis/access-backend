# 📡 WebSocket (Socket.io) — دليل الاستخدام

## الاتصال

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: '<JWT_TOKEN>' },
  // أو عبر query string:
  // query: { token: '<JWT_TOKEN>' }
});

socket.on('connect', () => console.log('✅ متصل:', socket.id));
socket.on('connect_error', (err) => console.error('❌', err.message));
```

---

## الأحداث المُرسَلة من العميل (Client → Server)

| الحدث | البيانات | الوصف |
|---|---|---|
| `join_conversations` | — | الانضمام لجميع غرف محادثات المستخدم دفعةً واحدة |
| `join_conversation` | `{ conversationId }` | الانضمام لغرفة محادثة محددة |
| `leave_conversation` | `{ conversationId }` | مغادرة غرفة محادثة |
| `send_message` | `{ conversationId, messageText, messageType?, attachmentUrl?, ... }` | إرسال رسالة عبر Socket (يُحفظ في DB) |
| `typing_start` | `{ conversationId }` | بدء الكتابة |
| `typing_stop` | `{ conversationId }` | التوقف عن الكتابة |
| `mark_read` | `{ conversationId }` | تعليم المحادثة كمقروءة |
| `get_presence` | `{ userIds: number[] }` | الاستعلام عن حالة اتصال مستخدمين |

---

## الأحداث المُستقبَلة من السيرفر (Server → Client)

| الحدث | البيانات | الوصف |
|---|---|---|
| `conversations_joined` | `{ count }` | تأكيد الانضمام للغرف |
| `joined_conversation` | `{ conversationId }` | تأكيد الانضمام لغرفة واحدة |
| `new_message` | `{ conversationId, message, isRetry? }` | رسالة جديدة (من HTTP أو Socket) أو إعادة إرسال |
| `user_typing` | `{ userId, fullName, conversationId }` | مستخدم يكتب |
| `user_stopped_typing` | `{ userId, conversationId }` | توقف عن الكتابة |
| `messages_read` | `{ conversationId, readBy, readAt }` | الرسائل قُرئت |
| `user_online` | `{ userId, fullName, onlineAt }` | مستخدم أصبح online |
| `user_offline` | `{ userId, offlineAt }` | مستخدم أصبح offline |
| `online_users` | `{ userIds: number[] }` | قائمة المتصلين عند الاتصال الأول |
| `presence_status` | `{ presence: { [userId]: boolean } }` | حالة اتصال المستخدمين المطلوبين |
| `user_joined` | `{ userId, fullName, conversationId }` | مستخدم انضم للمحادثة |
| `intervention_requested` | `{ conversationId, ticketId, reason, requestedBy }` | طلب تدخل إداري جديد |
| `error` | `{ message }` | رسالة خطأ |

---

## مثال كامل (React / Next.js)

```js
// 1. الاتصال
const socket = io(BACKEND_URL, { auth: { token } });

// 2. الانضمام لجميع محادثاتي
socket.emit('join_conversations');

// 3. استقبال رسائل جديدة
socket.on('new_message', ({ conversationId, message }) => {
  // أضف الرسالة للـ state الخاص بـ conversationId
});

// 4. مؤشر الكتابة
inputElement.addEventListener('input', () => {
  socket.emit('typing_start', { conversationId });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    socket.emit('typing_stop', { conversationId });
  }, 1500);
});

socket.on('user_typing', ({ userId, fullName }) => {
  showTypingIndicator(fullName);
});
socket.on('user_stopped_typing', ({ userId }) => {
  hideTypingIndicator(userId);
});

// 5. Presence
socket.on('user_online', ({ userId }) => updatePresence(userId, true));
socket.on('user_offline', ({ userId }) => updatePresence(userId, false));

// 6. التنظيف عند unmount
return () => socket.disconnect();
```

---

## ملاحظات

- التوكن يُمرَّر مرة واحدة عند الاتصال ولا يتجدد تلقائياً — أعد الاتصال عند انتهاء صلاحيته.
- الغرف مسماة بنمط `conversation:{id}` — المستخدم يستقبل فقط أحداث المحادثات التي ينتمي إليها.
- إرسال الرسالة عبر **HTTP** (`POST /api/messages/conversations/:id/messages`) يُرسل emit تلقائياً لجميع المتصلين بالغرفة.
- إرسال الرسالة عبر **Socket** (`send_message`) أسرع ولا يحتاج HTTP round-trip.

