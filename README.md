# 🚀 Jira Clone - Vue 3/Nuxt 3 Project Management Platform

A modern, full-featured project management application built with Vue 3, Nuxt 3 and is fully typed with TypeScript. This Jira-inspired clone provides comprehensive project tracking, team collaboration, and workflow management capabilities.

## ✨ Features

### 🏢 **Workspaces**

- Create and manage multiple workspaces
- Workspace-specific settings and configurations
- Team collaboration within isolated environments

### 📊 **Projects**

- Hierarchical project organization
- Project settings and configurations

### ✅ **Task Management**

- Create, assign, and track tasks
- Priority levels and status management

### 📋 **Multiple Views**

- **Kanban Board**: Drag-and-drop task management
- **Data Table**: Sortable and filterable task lists
- **Calendar View**: Timeline and deadline visualization

### 👥 **Team Collaboration**

- ✉️ **Invite System**
- **User Roles & Permissions**: Admin & Member access levels

### ⚙️ **Settings & Configuration**

- Workspace settings and preferences
- Project-specific configurations
- Member management

### 🖼️ **Media Management**

- Avatar uploads for workspaces & projects

### 🔒 **Authentication**

- GitHub OAuth integration
- Email/password authentication
- Secure session management

### 📱 **Responsive Design**

- Mobile-first approach
- Tablet and desktop optimized

## 🛠️ Tech Stack

- **Frontend Framework**: [Nuxt 3](https://nuxt.com/) with Vue 3 Composition API
- **Language**: TypeScript for type safety
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [Shadcn UI](https://www.shadcn-vue.com/)
- **Backend**: Prisma ORM with MySQL
- **Deployment**: [Vercel](https://vercel.com/) for seamless hosting
- **State Management**: Pinia & provide/inject for state management
- **Data Fetching**: @tanstack/vue-query
- **Authentication**: Custom email/password & GitHub OAuth

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- MySQL database (local or hosted)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/sytanta/nuxt-jira.git
cd nuxt-jira
```

2. **Install dependencies**

```bash
npm install
# or
yarn install
```

3. **Environment Setup**
   Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/vue_crm"

# Authentication
SESSION_SECRET="replace-with-long-random-string"
PUBLIC_SESSION_COOKIE_NAME="nuxt_session"

# OAuth (GitHub)
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
PUBLIC_OAUTH_CALLBACK_URL_GITHUB="http://localhost:3000/oauth/github/callback"

# Site Configuration
PUBLIC_SITE_URL="http://localhost:3000"
```

4. **Database Setup**

- Update `DATABASE_URL` in `.env` to point to your MySQL instance
- Run Prisma migrations (or push the schema)  
  ```bash
  npx prisma migrate dev --name init
  # or, if you just want to sync the schema
  npx prisma db push
  ```
- Generate the Prisma client (if not already generated)  
  ```bash
  npx prisma generate
  ```

5. **Run Development Server**

```bash
npm run dev
# or
yarn dev
```

Visit `http://localhost:3000` to see your application.

## 🔧 Key Features Implementation

### Kanban Board

Drag-and-drop functionality using Vue.Draggable with real-time updates persisted via Prisma/MySQL.

### Calendar Integration

Built with a customized Full Calendar component showing tasks.

### File Upload System

Workspace and project avatars are stored as base64-encoded strings within the database, removing the need for external storage services.

## 🚢 Deployment

### Vercel Deployment

1. **Connect Repository**
   - Import your repository to Vercel
   - Configure build settings (Nuxt 3 preset)

2. **Environment Variables**
   - Add all environment variables in Vercel dashboard
   - Ensure production URLs are updated

3. **Deploy**

## 🎯 Inspiration

This project is inspired by the excellent Next.js tutorial: [Build a Jira Clone](https://www.youtube.com/watch?v=Av9C7xlV0fA) but reimagined with Vue 3 ecosystem and modern development practices.

## 📋 Roadmap

- [ ] Advanced reporting and exports
- [ ] Time tracking functionality
- [ ] Offline mode support
- [ ] Mobile app (Ionic/Capacitor)
- [ ] Integration with external tools (Slack, Discord)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Shadcn UI](https://www.shadcn-vue.com/) for beautiful components
- [Nuxt 3](https://nuxt.com/) team for the amazing framework
- Original Next.js tutorial inspiration

## 📞 Support

If you have any questions or need help with setup, please open an issue.

---

**Happy coding! 🎉**
