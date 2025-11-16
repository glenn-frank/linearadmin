# Laravel Forge MCP Server Guide

## 🚀 **Manage Laravel Forge from Cursor**

Control your entire Forge infrastructure using natural language in Cursor!

---

## 🎯 **Quick Start**

### **1. Start the Forge MCP Server**

```bash
cd ~/Documents/apps/linearadmin
npm run mcp:forge
```

### **2. Configure Cursor**

Add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "laravel-forge": {
      "command": "node",
      "args": [
        "/Users/glennrenda/Documents/apps/linearadmin/node_modules/.bin/tsx",
        "/Users/glennrenda/Documents/apps/linearadmin/src/mcp-forge-server.ts"
      ],
      "env": {
        "FORGE_API_KEY": "your-forge-api-key-here"
      }
    }
  }
}
```

### **3. Reload Cursor**

```
Cmd+Shift+P → "Developer: Reload Window"
```

---

## 🛠️ **13 Forge Tools Available**

### **Server Management (2 tools)**

1. **`list_forge_servers`** - List all your servers
2. **`restart_nginx`** - Restart Nginx on a server
3. **`restart_php`** - Restart PHP-FPM

### **Site Management (3 tools)**

4. **`list_server_sites`** - List all sites on a server
5. **`create_site`** - Create a new site
6. **`deploy_site`** - Trigger deployment

### **Deployment (3 tools)**

7. **`get_deployment_status`** - Check latest deployment status
8. **`get_deployment_log`** - View deployment logs
9. **`install_repository`** - Connect Git repository
10. **`enable_quick_deploy`** - Enable auto-deploy on push

### **SSL & Environment (3 tools)**

11. **`get_site_ssl`** - View SSL certificates
12. **`install_letsencrypt_ssl`** - Install Let's Encrypt SSL
13. **`get_site_env`** - View environment variables
14. **`update_site_env`** - Update environment variables

---

## 💬 **Example Commands in Cursor**

### **List Your Infrastructure**

```
"Show me all my Forge servers"

Response:
Found 2 servers:
- Production Server (IP: 123.45.67.89) - DigitalOcean
- Staging Server (IP: 98.76.54.32) - AWS
```

```
"List sites on my production server"

Response:
Found 3 sites on server 12345:
- myapp.com (Laravel, Active)
- api.myapp.com (Node.js, Active)
- staging.myapp.com (Laravel, Deploying)
```

---

### **Deploy Your App**

```
"Deploy myapp.com"

Response:
✅ Deployment triggered for myapp.com
Deploying from: main branch
Latest commit: "Add new feature"
```

```
"Check deployment status for myapp.com"

Response:
Latest deployment:
- Status: Finished
- Started: 2 minutes ago
- Commit: abc1234 "Add new feature"
- Duration: 45 seconds
✅ Deployment successful!
```

```
"Show me the deployment log"

Response:
[Shows full deployment output]
```

---

### **Manage Sites**

```
"Create a new site called test.myapp.com on my production server"

Response:
✅ Site created successfully!
- Domain: test.myapp.com
- Type: Laravel
- Status: Installing
```

```
"Install my GitHub repo glenn-frank/myapp on test.myapp.com"

Response:
✅ Repository installed
- Repo: glenn-frank/myapp
- Branch: main
- Quick deploy: Enabled
```

---

### **SSL Management**

```
"Install SSL certificate for myapp.com"

Response:
✅ Let's Encrypt SSL installation started
Domains: myapp.com, www.myapp.com
This may take 2-3 minutes...
```

```
"Check SSL status for myapp.com"

Response:
SSL Certificate:
- Type: Let's Encrypt
- Status: Active
- Expires: March 15, 2025
- Auto-renew: Enabled
✅ Certificate valid
```

---

### **Server Operations**

```
"Restart nginx on my production server"

Response:
✅ Nginx restart initiated on server 12345
Service will be back online in a few seconds
```

```
"Restart PHP on my staging server"

Response:
✅ PHP 8.2 restart initiated
Application reloading...
```

---

### **Environment Variables**

```
"Show environment variables for myapp.com"

Response:
APP_ENV=production
APP_DEBUG=false
DB_CONNECTION=mysql
...
```

```
"Update the APP_DEBUG variable to true for staging.myapp.com"

Response:
✅ Environment variables updated
Remember to deploy for changes to take effect!
```

---

## 🎯 **Real-World Workflows**

### **Workflow 1: Deploy New Feature**

```
You: "Deploy myapp.com and show me the logs"

Cursor:
1. [Triggers deployment]
   ✅ Deployment started

2. [Waits a moment]

3. [Gets deployment log]
   📋 Deployment log:
   Installing dependencies...
   Running migrations...
   Building assets...
   ✅ Deployment complete!
```

---

### **Workflow 2: New Site Setup**

```
You: "Create a new Laravel site called api.myapp.com on my production server, connect it to my glenn-frank/myapp-api repo, and enable SSL"

Cursor:
1. [Creates site]
   ✅ Site created: api.myapp.com

2. [Installs repository]
   ✅ Repo connected: glenn-frank/myapp-api

3. [Installs SSL]
   ✅ SSL certificate installing...

Done! Your site is ready.
```

---

### **Workflow 3: Quick Diagnostics**

```
You: "Check if my app deployed successfully and restart nginx if needed"

Cursor:
1. [Checks deployment status]
   ✅ Latest deployment: Successful (2 min ago)

2. No issues found. Nginx restart not needed.
```

---

## ✅ **Combined with Linear MCP**

**Run BOTH MCP servers:**

```bash
# Terminal 1: Linear MCP
npm run mcp:server

# Terminal 2: Forge MCP
npm run mcp:forge
```

**Now you can:**

```
"Create a Linear issue for deploying the new feature"
→ Uses Linear MCP

"Deploy the app to production"
→ Uses Forge MCP

"Add a comment to the Linear issue that deployment is complete"
→ Uses Linear MCP
```

**Cursor automatically picks the right MCP for each task!**

---

## 🔧 **Cursor Configuration (Both MCPs)**

```json
{
  "mcpServers": {
    "linear-admin": {
      "command": "node",
      "args": [
        "/Users/glennrenda/Documents/apps/linearadmin/node_modules/.bin/tsx",
        "/Users/glennrenda/Documents/apps/linearadmin/src/mcp-server.ts"
      ],
      "env": {
        "LINEAR_API_KEY": "your-linear-key",
        "OPENAI_API_KEY": "your-openai-key"
      }
    },
    "laravel-forge": {
      "command": "node",
      "args": [
        "/Users/glennrenda/Documents/apps/linearadmin/node_modules/.bin/tsx",
        "/Users/glennrenda/Documents/apps/linearadmin/src/mcp-forge-server.ts"
      ],
      "env": {
        "FORGE_API_KEY": "your-forge-api-key"
      }
    }
  }
}
```

---

## 📚 **Complete Tool List**

| Tool                      | What It Does            |
| ------------------------- | ----------------------- |
| `list_forge_servers`      | Show all servers        |
| `list_server_sites`       | Show sites on a server  |
| `create_site`             | Create new site         |
| `deploy_site`             | Deploy site             |
| `get_deployment_status`   | Check deployment status |
| `get_deployment_log`      | View deployment logs    |
| `install_repository`      | Connect Git repo        |
| `enable_quick_deploy`     | Auto-deploy on push     |
| `get_site_ssl`            | View SSL certificates   |
| `install_letsencrypt_ssl` | Install SSL             |
| `restart_nginx`           | Restart Nginx           |
| `restart_php`             | Restart PHP-FPM         |
| `get_site_env`            | View environment vars   |
| `update_site_env`         | Update environment vars |

---

## 🎉 **You Now Have 34 Total MCP Tools!**

- **21 Linear tools** - Issue management, dependencies, labels
- **13 Forge tools** - Server management, deployment

**Manage your entire development workflow from Cursor!** 🚀

---

**Start the Forge MCP and try it:** `npm run mcp:forge`








