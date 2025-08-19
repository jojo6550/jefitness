# FitLife Pro - Personal Fitness & Wellness Platform

A comprehensive web application for personal fitness tracking, workout planning, and wellness management. Built with modern web technologies to provide users with an all-in-one solution for their fitness journey.

## 🚀 Live Demo
Visit the live application: [FitLife Pro](https://jojo6550.github.io)

## 📋 Features

### Core Features
- **User Authentication & Authorization** - Secure login/signup with role-based access
- **Personal Dashboard** - Overview of fitness metrics and progress
- **Workout Programs** - Customizable workout plans and routines
- **BMI Calculator** - Track body mass index and health metrics
- **Sleep Tracking** - Monitor sleep patterns and quality
- **Timer & Stopwatch** - Built-in tools for workout timing
- **Progress Statistics** - Visual charts and reports for fitness data

### Admin Features
- **Client Management** - Manage user accounts and permissions
- **Program Administration** - Create and modify workout programs
- **Analytics Dashboard** - View platform-wide statistics

### User Features
- **Profile Management** - Update personal information and preferences
- **Schedule Planning** - Plan workouts and set reminders
- **Progress Tracking** - Log workouts and track improvements
- **Service Booking** - Book personal training sessions

## 🛠️ Tech Stack

### Frontend
- **HTML5** - Semantic markup structure
- **CSS3** - Responsive styling with custom design
- **JavaScript (ES6+)** - Interactive functionality
- **Responsive Design** - Mobile-first approach

### Backend
- **Node.js** - Server runtime environment
- **Express.js** - Web application framework
- **MongoDB** - Database for user data storage
- **JWT Authentication** - Secure token-based auth

### Development Tools
- **Git** - Version control
- **npm** - Package management
- **VS Code** - Development environment

## 📁 Project Structure

```
├── public/
│   ├── index.html              # Landing page
│   ├── pages/                  # Application pages
│   ├── js/                     # Client-side JavaScript
│   ├── styles/                 # CSS stylesheets
│   └── images/                 # Static assets
├── src/
│   ├── server.js               # Express server
│   ├── routes/                 # API endpoints
│   ├── models/                 # Database schemas
│   └── middleware/             # Authentication middleware
├── config/                     # Database configuration
└── package.json               # Dependencies
```

## 🚦 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud instance)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jojo6550/jojo6550.github.io.git
   cd jojo6550.github.io
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/dashboard` - Get user dashboard data

### Fitness Data
- `POST /api/fitness/bmi` - Calculate BMI
- `GET /api/fitness/progress` - Get progress data
- `POST /api/fitness/workout` - Log workout
- `GET /api/fitness/workouts` - Get workout history

### Sleep Tracking
- `POST /api/sleep/log` - Log sleep data
- `GET /api/sleep/data` - Get sleep history

## 🎨 User Interface

### Pages Overview
- **Landing Page** - Introduction and feature showcase
- **Login/Signup** - Authentication pages
- **Dashboard** - Personal fitness overview
- **Profile** - User settings and preferences
- **Workout Programs** - Available fitness programs
- **Schedule** - Workout calendar and planning
- **Statistics** - Progress visualization
- **Sleep Tracker** - Sleep monitoring interface

### Design Philosophy
- **Clean & Modern** - Minimalist design with intuitive navigation
- **Responsive** - Optimized for all device sizes
- **Accessible** - WCAG 2.1 compliant for inclusive design
- **Performance** - Optimized loading times and smooth interactions

## 🔐 Security Features

- **Password Hashing** - bcrypt for secure password storage
- **JWT Tokens** - Secure authentication tokens
- **Input Validation** - Comprehensive data validation
- **Rate Limiting** - Protection against brute force attacks
- **HTTPS Ready** - SSL/TLS compatible

## 📊 Database Schema

### User Model
```javascript
{
  username: String,
  email: String,
  password: String (hashed),
  role: String (user/admin),
  profile: {
    age: Number,
    weight: Number,
    height: Number,
    fitnessGoals: [String]
  },
  createdAt: Date,
  updatedAt: Date
}
```

### Workout Model
```javascript
{
  userId: ObjectId,
  type: String,
  duration: Number,
  caloriesBurned: Number,
  date: Date,
  notes: String
}
```

### Sleep Model
```javascript
{
  userId: ObjectId,
  hours: Number,
  quality: Number (1-5),
  date: Date,
  notes: String
}
```



## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.


**Built with ❤️ by [Josiah]

