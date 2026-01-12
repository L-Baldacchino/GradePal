# 📚 Grade Pal — Your Uni Grade Companion
_Created by Luke Baldacchino_

A lightweight, distraction-free app that helps students track grades, calculate required marks, and stay focused.

## 🎯 What is Grade Pal?

Grade Pal is a clean, modern mobile app designed specifically for university students who want a simple way to:
- Track each subject
- Add assessments, exams, and grades
- Instantly see their accumulated grade
- Calculate how much they need to pass
- Stay productive using a built-in Pomodoro timer
  
The app focuses on clarity, lightweight functionality, and zero distractions.

## ❤️ Why Grade Pal Exists
Grade Pal was created because most students either:
- use messy spreadsheets
- use websites full of ads
- or don’t know where they stand academically

This app solves that in the simplest possible way.
Clean, fast, reliable, made for real students with real workloads.

## ☕️ Support the Project
If Grade Pal helps you, please consider supporting development ❤️

👉 Buy me a coffee: https://www.buymeacoffee.com/teraau

## 💬 Community & Support

Have feedback, found a bug, or want to discuss ideas?

👉 **Join the community Discord [here](https://discord.gg/frUpBh3jm4)**

Inside the server you’ll find:
- 🐞 Bug reporting
- 💡 Feature suggestions
- 📢 App updates and announcements
- ❓ Help from the developer and community


_____________________________________________________

## ✨ Core Features

### 1. Multi-Subject Grade Tracking 
- Add as many subjects as you like.
- Each subject stores:
  - Subject code (e.g., CSE3MAD)
  - Subject name (e.g., Mobile Application Development)
- A fully customisable grade planner
- Switch between subjects instantly

### 2. Smart Grade Planner 
Each subject includes its own planner where you can:
- Add/remove assessments and exams
- Enter weight % and grades
- View contribution of each item
- Automatically see your Accumulated Grade So Far
- Confirm total weighting equals 100%
- Beautiful, theme-consistent UI
- The planner adjusts dynamically while you type, even when the keyboard is open

### 3. Built-In Pomodoro Timer
Stay productive using a clean, focused Pomodoro timer:
- Tap time values to manually type custom times
- Optional break timer after a session
- Alerts when a session finishes
- Tracks daily sessions
- Shows recent sessions (last 3)
- Shows all-time totals per subject
- Syncs with your list of subjects
- Dark and light theme safe-area layouts
- Clean scrolling behaviour without conflicts
- A powerful study tool without extra noise

### 4. Support & Feedback Screen
Inside the Support tab, students can:
- Read why the app was built
- Donate via Buy Me a Coffee
- Join the Discord community
- View Github repo
- Reset all saved data across the entire app

## 🎨 Theme Support
Grade Pal includes multiple themes:
- 🌙 Dark Mode (soft navy palette)
- 🌤️ Light Mode (soft lavender palette)
- Toggle in the top right corner
  - Themes apply across all screens: home, planner, pomodoro, support


## 📱 How to Use
### 🏠 Home Screen
- Tap Add Subject
- Enter subject code + subject name
- Tap a subject card to open its grade planner

### 📊 Grade Planner
Inside each subject:
- Tap Add Item to add an assessment

Enter:
- Name
- Weight %
- Grade (optional)
Your Accumulated Grade updates instantly

The Total Weighting pill shows:
- ✅ Green if totals 100%
- 🔴 Red if totals do not equal 100%

Remove any item with the Remove button.

### ⏱ Pomodoro Timer
- Select a subject
- Tap the timer values to manually enter times
- Press Start Focus
- Receive an alert when complete

View:
- Last 3 sessions
- All-time totals per subject

### 💬 Planner Tab
- Add items for planning
- auto adds assignments and exams
- auto orders based on date (upcoming at the top)


### 💬 Support Tab
- Buy the developer a coffee ☕️
- Send feedback via email
- Reset all stored data


## 🔒 Privacy & Data
Grade Pal:
- Stores all data locally on the device
- Does not collect analytics
- Does not transmit personal data
- Requires no login, no account, no cloud services


## 🧰 Tech Stack

Grade Pal is built using a modern, lightweight, and highly reliable mobile development stack designed for performance and simplicity.

### **Core Framework**
- **React Native (Expo)** – Cross-platform mobile development with fast iteration.

### **Navigation & Architecture**
- **Expo Router** – File-system-based routing for clean, intuitive navigation.
- **Bottom Tabs Navigator** – Simple, user-friendly tab navigation.

### **State & Data Storage**
- **AsyncStorage** – Local device persistence for subjects, grade planners, Pomodoro history, and theme settings.
- **React Hooks** – State, memoization, and side-effects.

### **UI & Theming**
- **Custom Theme Provider** – Supports light and dark modes with soft color palettes.
- **React Native Safe Area Context** – Proper layout handling across devices.
- **Dynamic keyboard handling** – Automatic view resizing for text inputs.

### **Device APIs**
- **expo-constants** – Reads the app version for feedback emails.
- **expo-linking** – Opens user email apps and external URLs (Buy Me a Coffee).

### **Build & Deployment**
- **Expo Application Services (EAS)** – Production AAB builds and development APKs.
- **Google Play Store** – Distribution platform for Android users.

### **Developer Tools**
- **TypeScript (optional)** – Improved safety and maintainability.
- **Hermes Engine** – Faster JS runtime with reduced APK size.

## **Screenshots**

### Grade Pal - Logo

<img width="512" height="512" alt="GradePalLogo (1)" src="https://github.com/user-attachments/assets/8d611a51-a2ed-43db-acd5-034a55c05c25" />


### Play Store banner

<img width="1024" height="500" alt="Plan Study" src="https://github.com/user-attachments/assets/d80be70b-f19b-4e8d-8e12-1b992032abf0" />


### Home Screen - Track your subjects
![Home Screen - Track your subjects](https://github.com/user-attachments/assets/44625521-9d59-4a5b-af65-23aec347efca)


### Subject Screen - Track your results
![Subject Screen - Track your results](https://github.com/user-attachments/assets/6d1c8a6c-85eb-416e-a4a0-96f614fe90eb)


### Pomodoro Timer - Track your study habits
![Pomodoro Timer - Track your study habits](https://github.com/user-attachments/assets/08b7e529-a87c-4cd2-8913-18f1a818ed8b)


### Support screen - Buy me a coffee!
![Support screen - Buy me a coffee!](https://github.com/user-attachments/assets/d4fcd99e-1bfd-44bd-b8f5-56dfdbab903d)





# 📄 License

Copyright (c) 2025 Luke Baldacchino

All rights reserved.

This application, including its source code, design, assets, and content, is the exclusive property of the copyright holder.

Permission is granted to install and use the application for personal, non-commercial purposes.

You may NOT:
- modify, copy, distribute, sublicense, or create derivative works,
- reuse or repurpose the source code,
- reverse engineer, decompile, or extract components of the application,
- use any part of this software in another application or project.

This software is provided "as is" without warranty of any kind, express or implied.
