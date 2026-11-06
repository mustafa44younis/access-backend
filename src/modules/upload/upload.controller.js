const path = require('path');
const config = require('../../config');
const db = require('../../config/db');

/**
 * تنسيق حجم الملف بشكل مقروء
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * تصنيف نوع الملف تلقائياً
 */
const detectCategory = (ext, mimetype) => {
  const e = ext.toLowerCase().replace('.', '');
  if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(e) || mimetype.startsWith('image/')) {
    return 'designs';
  }
  if (['mp3', 'wav', 'm4a', 'ogg', 'webm'].includes(e) || mimetype.startsWith('audio/')) {
    return 'audio';
  }
  return 'documents';
};

/**
 * رفع ملف عام وإرجاع بياناته ورابطه
 */
const uploadSingleFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'يرجى اختيار ملف لرفعه',
      });
    }

    const file = req.file;
    const ext = path.extname(file.originalname);
    const category = detectCategory(ext, file.mimetype);
    const formattedSize = formatFileSize(file.size);
    
    // إنشاء الرابط الكامل
    const fileUrl = `${config.app.backendUrl}/uploads/${file.filename}`;

    return res.status(201).json({
      success: true,
      message: 'تم رفع الملف بنجاح',
      data: {
        file_name: file.originalname,
        stored_name: file.filename,
        file_url: fileUrl,
        file_type: ext.replace('.', '').toUpperCase(),
        file_category: category,
        file_size: formattedSize,
        size_bytes: file.size,
        mime_type: file.mimetype,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء رفع الملف',
    });
  }
};

/**
 * رفع وتحديث الصورة الشخصية للعميل مباشرة
 */
const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'يرجى اختيار صورة شخصية',
      });
    }

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return res.status(400).json({
        success: false,
        message: 'يجب أن تكون الصورة الشخصية بتنسيق JPG أو PNG أو WebP',
      });
    }

    const avatarUrl = `${config.app.backendUrl}/uploads/${file.filename}`;

    await db.query(
      'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
      [avatarUrl, req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'تم تحديث الصورة الشخصية بنجاح',
      data: {
        avatar_url: avatarUrl,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'حدث خطأ أثناء رفع الصورة الشخصية',
    });
  }
};

module.exports = {
  uploadSingleFile,
  uploadAvatar,
};

