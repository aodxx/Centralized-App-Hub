# Centralized App Hub

ศูนย์กลางสำหรับค้นหา จัดหมวดหมู่ และเปิดใช้งาน SPA/Web App หลายระบบจากหน้าเดียว ข้อมูลรายการแอปมาจาก Google Sheets ที่ Publish เป็น CSV และเว็บไซต์ทำงานแบบ Static บน GitHub Pages

## โครงสร้างไฟล์

```text
centralized-app-hub/
├── index.html
├── assets/
│   ├── css/styles.css
│   └── js/app.js
├── sample-data.csv
├── .nojekyll
└── README.md
```

## ตั้งค่า Google Sheets

1. สร้างชีตที่มีหัวคอลัมน์ `id,title,category,url,icon,description,open_type`
2. ค่า `id` ต้องไม่ซ้ำกัน
3. `open_type` ใช้ `embed` หรือ `tab`
4. ไปที่ **File → Share → Publish to web** เลือกชีตที่ต้องการและชนิด **Comma-separated values (.csv)**
5. เปิดหน้า Centralized App Hub กด **ตั้งค่า** วาง CSV URL แล้วกด **ทดสอบการเชื่อมต่อ**
6. กด **บันทึกและ Sync** URL จะถูกเก็บใน LocalStorage ของ Browser

> เว็บปลายทางบางแห่งห้ามแสดงผ่าน iframe ด้วย `X-Frame-Options` หรือ CSP ให้กำหนด `open_type=tab` หรือใช้ปุ่ม “เปิดแท็บใหม่” ใน Viewer

## Deploy บน GitHub Pages

1. เปิด Repository → **Settings → Pages**
2. ใน **Build and deployment** เลือก **Deploy from a branch**
3. เลือก branch `main` และโฟลเดอร์ `/ (root)` แล้วกด **Save**
4. เว็บไซต์จะอยู่ที่ `https://<username>.github.io/centralized-app-hub/`

## เทคโนโลยี

- Tailwind CSS CDN
- Font Awesome CDN
- PapaParse
- Vanilla JavaScript ES6+
- Google Sheets CSV + LocalStorage

## หมายเหตุด้านความปลอดภัย

- ระบบยอมรับเฉพาะ URL โปรโตคอล HTTP/HTTPS
- ข้อความจาก CSV แสดงด้วย DOM `textContent` เพื่อลดความเสี่ยง XSS
- ลิงก์แท็บใหม่ใช้ `noopener,noreferrer`
- Google Sheets ที่ Publish เป็น CSV ถือเป็นข้อมูลสาธารณะ ห้ามใส่รหัสผ่าน คีย์ API หรือข้อมูลลับ
