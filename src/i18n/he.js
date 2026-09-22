// he.js — Hebrew patient-app strings (the canonical table; every other
// language must carry exactly these keys — enforced by index.test.js).
//
// Flat dotted keys. `{name}` tokens are interpolated by makeT(); a value may
// be a plural object { one, two, few, many, other } (see shared/i18n/core.js).

export const he = {
  'app.title':            'מדד — שאלון לפני הפגישה',

  'boot.loading':         'טוען שאלון…',
  'boot.loadingAria':     'טוען שאלון',

  'error.noItems':        'לא נבחרו שאלונים.',
  'error.noItemsHint':    'יש לפתוח את הקישור שקיבלת מהמטפל.',
  'error.cannotLoad':     'לא ניתן לטעון את השאלון.',
  'error.timeout':        'הבקשה ארכה זמן רב מדי. בדוק את חיבור האינטרנט ונסה שנית.',
  'error.badLink':        'הקישור שגוי או שאינו זמין.',
  'error.contactTherapist': 'אנא פנה למטפל שלך לקבלת קישור חדש.',
  'error.network':        'בדוק את חיבור האינטרנט ונסה שנית, או פנה למטפל לקבלת קישור חדש.',
  'error.expiredLink':    'הקישור שגוי או פג תוקף.',
  'error.retry':          'נסה שוב',
  'error.generic':        'אירעה שגיאה: {message}',

  'welcome.appName':      'מדד · CTR',
  'welcome.tagline':      'הערכה קלינית דיגיטלית',
  'welcome.intro':        'התשובות שלך יעזרו לצוות המטפל להבין אותך טוב יותר.',
  'welcome.disclosure':   'התשובות והציונים — ללא שם וללא פרטים מזהים — יישלחו ישירות למטפל/ת שלך.',
  'welcome.nameLabel':    'שמך',
  'welcome.namePlaceholder': 'שמך המלא',
  'welcome.begin':        'התחל',

  'progress.item':        'שאלה {current} מתוך {total}',
  'progress.aria':        'התקדמות בשאלון',
  'progress.battery':     'שאלון {current} מתוך {total}',

  'nav.back':             'חזור לשאלה הקודמת',
  'nav.forward':          'עבור לשאלה הבאה',

  'item.continue':        'המשך',
  'item.continueEmpty':   'המשך ללא מילוי',
  'item.continueNoSelection': 'המשך ללא בחירה',
  'item.dragHint':        'גרור כדי לבחור ערך',

  'text.number':          'יש להזין מספר',
  'text.min':             'המינימום הוא {min}',
  'text.max':             'המקסימום הוא {max}',
  'text.email':           'כתובת דוא"ל לא תקינה',
  'text.pattern':         'הערך אינו בפורמט הנדרש',

  'results.eyebrow':      'סיכום הערכה',
  'results.title':        'התוצאות שלך',
  'results.hint':         'ניתן לחזור אחורה ולשנות תשובות — התוצאות והדוח יתעדכנו בהתאם.',
  'results.pdfError':     'לא ניתן להכין את הדוח. בדוק את חיבור האינטרנט ונסה שנית.',
  'results.preparing':    'מכין דוח...',
  'results.retry':        'נסה שוב',
  'results.share':        'שתף דוח PDF',
  'results.download':     'הורד דוח PDF',

  'send.sending':         'שולח את התוצאות למטפל/ת…',
  'send.sent':            'התוצאות נשלחו למטפל/ת שלך.',
  'send.sentDetail':      'אין צורך לעשות דבר נוסף. אפשר גם להוריד עותק PDF לעצמך.',
  'send.failed':          'לא הצלחנו לשלוח את התוצאות.',
  'send.failedDetail':    'נסו שוב, או הורידו את דוח ה-PDF ושלחו אותו למטפל/ת בעצמכם.',
  'send.failedRetry':     'נסו לשלוח שוב',
  'send.refused':         'לא ניתן לשלוח את התוצאות דרך קישור זה.',
  'send.refusedDetail':   'הורידו את דוח ה-PDF ושלחו אותו למטפל/ת, ובקשו קישור חדש.',

  'pdf.date':             'תאריך',
  'pdf.pid':              'מזהה אישי',
  'pdf.name':             'שם',
  'pdf.completed':        'הושלם',
  'pdf.subscales':        'תתי-מדדים:',
  'pdf.colScore':         'ציון',
  'pdf.colAnswer':        'תשובה',
  'pdf.colItem':          'תוכן הפריט',
  'pdf.rating':           'דירוג:',
  'pdf.page':             'עמוד {current} מתוך {total}',
  'pdf.footer':           'מדד · CTR — מעקב טיפולי',
};
