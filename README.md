# JE Fitness - Personal Training Platform

A comprehensive fitness tracking and personal training platform built with Node.js, Express, and MongoDB.

## About

JE Fitness is a full-stack web application designed for personal training services. The platform provides users with tools to track their fitness journey, manage workout programs, monitor sleep patterns, and maintain nutrition logs. Built by Josiah as a portfolio project to demonstrate full-stack development skills.

## Features

### User Management
- **User Registration & Authentication**: Secure signup/login with JWT tokens
- **Role-based Access**: User and Admin roles with different permissions
- **Profile Management**: Update personal information, fitness goals, and preferences
- **Email Notifications**: Welcome emails sent via SendGrid integration

### Fitness Tracking
- **Workout Programs**: Access to personalized workout routines
- **Sleep Tracking**: Monitor sleep patterns and duration
- **BMI Calculator**: Calculate and track body mass index
- **Statistics Dashboard**: Visual progress tracking with charts and metrics
- **Workout Timer**: Built-in timer for exercise intervals

### Nutrition Management
- **Meal Logging**: Track daily food intake with calories and macros
- **Nutrition History**: View past meal logs and nutritional data
- **Calorie Tracking**: Monitor daily caloric intake

### Scheduling
- **Personal Schedule**: Manage workout sessions and appointments
- **Calendar Integration**: Plan and view upcoming fitness activities

### Admin Features
- **Client Management**: View and manage all registered users
- **Admin Dashboard**: Comprehensive overview of platform activity

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - MongoDB object modeling
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing
- **SendGrid** - Email service
- **Nodemailer** - Email sending

### Frontend
- **HTML5** - Structure
- **CSS3** - Styling with Bootstrap 5.3.3
- **JavaScript** - Client-side functionality
- **Bootstrap Icons** - UI icons

## Project Structure

```
jojo6550.github.io/
├── src/
│   ├── server.js          # Main server file
│   ├── middleware/
│   │   └── auth.js        # Authentication middleware
│   ├── models/
│   │   └── User.js        # User schema
│   └── routes/
│       ├── auth.js        # Authentication routes
│       ├── clients.js     # Client management routes
│       └── sleep.js       # Sleep tracking routes
├── public/
│   ├── index.html         # Landing page
│   ├── pages/             # Application pages
│   │   ├── dashboard.html
│   │   ├── profile.html
│   │   ├── login.html
│   │   ├── signup.html
│   │   ├── sleep-tracker.html
│   │   ├── timer.html
│   │   ├── schedule.html
│   │   ├── view-statistics.html
│   │   └── programs/      # Workout program pages
│   ├── js/                # Client-side JavaScript
│   ├── styles/            # CSS styles
│   └── images/            # Static assets
├── config/
│   └── db.js              # Database configuration
├── package.json
└── .gitignore
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- SendGrid account (for email functionality)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/jojo6550/jojo6550.github.io.git
cd jojo6550.github.io
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory:
```env
MONGO_URI=
