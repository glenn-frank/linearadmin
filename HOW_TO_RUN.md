# 🚀 How to Run - SIMPLEST GUIDE

## One Command, That's It!

```bash
npm run create-laravel-app
```

**Then:**

1. Answer the questions
2. When asked: **"Automatically install dependencies and start servers?"** → Say **YES**
3. Wait ~8-10 minutes
4. Open `http://localhost:5173` in your browser
5. ✅ **Done!** Your app is running!

---

## 📋 What Happens Automatically

When you say **YES** to auto-start:

```
✅ Creates your Laravel + React app
✅ Checks if ports 8000 & 5173 are busy → Kills them
✅ Runs composer install (backend dependencies)
✅ Generates Laravel app key
✅ Creates database
✅ Runs migrations
✅ Runs npm install (frontend dependencies)
✅ Starts Laravel backend (port 8000)
✅ Starts React frontend (port 5173)
✅ Keeps both running
```

**You do NOTHING!** Just answer questions and wait.

---

## 🎯 Complete Example

```bash
$ npm run create-laravel-app

? What is the name of your Laravel app? my-app
? Describe your application: My awesome app
? Where should the project be created? /Users/me/Documents/apps
? GitHub repository URL? https://github.com/me/my-app
... (more questions) ...
? Automatically install dependencies and start servers? YES ← **KEY ANSWER**

Creating app...
Installing dependencies...
Starting servers...

🎉 Your application is now running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 Frontend: http://localhost:5173
🔧 Backend API: http://localhost:8000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Press Ctrl+C to stop both servers

🚀 Open http://localhost:5173 in your browser!
```

**Open browser → App is running → Register/Login → USE IT!**

---

## 🛑 How to Stop

```bash
# In the terminal where it's running:
Ctrl+C

# Both servers stop automatically
✅ Done!
```

---

## ⚠️ Requirements

You need these installed:

- PHP 8.1+
- Composer
- Node.js 18+
- npm

The script checks these automatically and tells you if anything is missing.

---

## 💡 If You Say NO to Auto-Start

```
? Automatically install dependencies and start servers? No

📝 To start your application:
   cd /path/to/my-app/backend
   composer install
   php artisan migrate
   php artisan serve

   In another terminal:
   cd /path/to/my-app/frontend
   npm install
   npm run dev
```

You get manual instructions instead.

---

## 🎉 TL;DR

**Absolute simplest way:**

```bash
npm run create-laravel-app
```

Answer questions, say **YES** to auto-start, wait, open browser. **Done!**

---

**That's it!** No manual dependency installation, no manual migrations, no starting servers manually. The script does EVERYTHING for you! 🚀

