# LandSetu 🌐

> **Real-Time National Land Acquisition Management & Tracking Platform**  
> Smart India Hackathon (SIH) Project — Team INNOVA21

<p align="center">
  <b>Team ID: NITS_021</b><br>
  <b>NIT Silchar</b>
</p>

---

## 📌 About LandSetu

**LandSetu** is a real-time, role-based digital platform designed to modernize and streamline the land acquisition process.

The platform replaces fragmented, paper-based workflows with a centralized digital system where citizens, land officers, administrators, and other stakeholders can track and manage land acquisition cases through a structured workflow.

The system focuses on:

- Transparent land acquisition tracking
- Role-based access and dashboards
- Centralized land and compensation records
- Real-time status updates
- Secure authentication
- Digital verification and approval workflows
- Compensation management
- Database-backed case tracking
- ML-assisted land compensation estimation

LandSetu is developed as our solution for the **Smart India Hackathon (SIH) Land Acquisition problem statement**.

---

## 🚨 Problem Statement

The traditional land acquisition process can involve multiple departments, physical documents, manual verification, repeated data entry, and limited visibility for landowners.

This can create challenges such as:

- Difficulty tracking the current status of an acquisition case
- Delays caused by manual movement of documents
- Lack of centralized information
- Limited transparency for citizens
- Difficulty coordinating between departments
- Manual management of compensation information
- Lack of a unified digital trail of important events
- Difficulty accessing historical case information
- Limited data-driven support for compensation estimation

A land acquisition process may involve multiple stakeholders such as:

**Citizen / Landowner → Revenue / Land Officer → Administrator → Requisitioning Agency → Treasury / Compensation Process**

A centralized system is therefore needed to connect these stages and maintain a consistent digital record.

---

# 💡 Our Solution

## LandSetu

LandSetu provides a centralized, role-based web application for managing the land acquisition lifecycle.

Instead of relying on disconnected paperwork and manual status tracking, every acquisition case can be represented digitally using a unique case identifier and associated land records.

### Core workflow

```text
Citizen
   │
   ▼
Land Acquisition Application
   │
   ▼
Land Officer Verification
   │
   ▼
Administrator Review / Approval
   │
   ▼
Compensation Processing
   │
   ▼
Treasury / Fund Release
   │
   ▼
Case Tracking & Record History
```

The system maintains the information required at different stages and allows authorized users to perform actions according to their roles.

---

# 👥 Role-Based System

## 1. Citizen / Landowner

Citizens can interact with the platform to:

- Submit or view land acquisition information
- Access their land-related records
- Track acquisition status
- View relevant case information
- Monitor compensation-related information
- Follow the progress of an acquisition case

## 2. Land Officer

Land officers can:

- Review submitted land information
- Verify land and acquisition details
- Update the progress of cases
- Maintain land records
- Add important events to the case timeline
- Move cases through the verification workflow

## 3. Administrator

Administrators can:

- Monitor acquisition cases
- Review verified applications
- Approve relevant stages
- Manage compensation workflows
- Monitor system records
- Coordinate the overall acquisition process

---

# 🔄 End-to-End Acquisition Flow

```text
┌──────────────┐
│    Citizen   │
└──────┬───────┘
       │
       ▼
┌─────────────────────┐
│ Submit / Register   │
│ Land Acquisition    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Land Officer        │
│ Verification        │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Administrator       │
│ Review & Approval   │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Compensation        │
│ Processing          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Treasury / Fund     │
│ Release             │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ Case History &      │
│ Status Tracking     │
└─────────────────────┘
```

---

# ✨ Key Features

### 🔐 Role-Based Authentication

Different users receive access to features according to their role.

Authentication is handled through the backend and database-backed credential verification.

### 📋 Digital Case Management

Each acquisition process can be tracked digitally using a unique **Case ID**.

The Case ID acts as the central reference for the acquisition workflow.

### 🗺️ Land Record Management

Land information is maintained digitally and can be associated with acquisition cases and users.

### 📊 Real-Time Status Tracking

Users can track the current stage of an acquisition process instead of depending entirely on physical documents or manual communication.

### 🕒 Event / Timeline Tracking

Important updates can be recorded against an acquisition case, creating a digital history of the process.

### 💰 Compensation Management

Compensation-related information is maintained as part of the digital acquisition workflow.

The system is also integrated with a separate machine-learning module for compensation estimation.

### 🤖 ML-Based Compensation Prediction

LandSetu includes a separate ML application that estimates land compensation based on relevant land and location-related features.

The prediction module is maintained in a separate repository so that the machine-learning component can evolve independently from the main application.

### 🗄️ Centralized MySQL Database

MySQL is used as the primary relational database for storing application data.

The backend communicates with MySQL through the Node.js application.

### 🔄 Transaction-Safe Backend Operations

Important database operations can be handled using database transactions to maintain consistency when multiple related records need to be updated together.

---

# 🤖 Machine Learning Compensation Prediction

The ML component is developed as a separate project.

### Repository

**Land Acquisition Prediction:**  
https://github.com/suroj003/Land_acq_prediction

### Live ML Demo

https://landacqprediction.streamlit.app/

The ML application uses a trained machine-learning model to estimate compensation from input land characteristics.

The deployed application is built with **Streamlit**.

### ML Repository Structure

```text
Land_acq_prediction/
│
├── app.py
├── columns.pkl
├── land_acq_final.pkl
├── requirements.txt
└── .devcontainer/
```

The trained model and feature-column information are stored separately so that the Streamlit application can load the same feature structure used during model training.

---

# 🧠 Technology Stack

## Frontend

- HTML5
- CSS3
- JavaScript
- Responsive web interface

## Backend

- Node.js
- Express.js
- REST-style APIs
- JWT-based authentication
- Server-side business logic

## Database

- MySQL
- Relational database design
- Foreign-key relationships
- Transaction-based operations

## Machine Learning

- Python
- Pandas
- Scikit-learn
- Random Forest Regression
- Joblib
- Streamlit

## Deployment

- Render — Main LandSetu application
- Streamlit Cloud — ML compensation prediction application

---

# 🏗️ Main Repository Structure

```text
Land_setu/
│
├── .vscode/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── .gitignore
├── README.md
├── db.js
├── main_db.sql
├── package.json
├── package-lock.json
├── seeds.js
└── server.js
```

### Folder / File Description

- **public/** — Contains the frontend of the LandSetu application.
  - `index.html` — Main HTML structure and UI.
  - `style.css` — Styling and layout.
  - `app.js` — Frontend JavaScript and client-side interactions.

- **server.js** — Main Node.js / Express backend server and API handling.

- **db.js** — MySQL database connection and database-related configuration.

- **main_db.sql** — SQL schema/database setup.

- **seeds.js** — Seed/demo data used for development and testing.

- **package.json** — Project metadata, dependencies, and scripts.

- **package-lock.json** — Locked dependency versions.

- **.gitignore** — Files and folders excluded from Git tracking.

- **.vscode/** — VS Code project configuration.

---

# 🗃️ Database Architecture

LandSetu uses **MySQL** as the central relational database.

The database is designed around the relationships between users, land records, acquisition cases, compensation records, and case history.

A simplified conceptual structure is:

```text
Users
  │
  ├──────────────┐
  │              │
  ▼              ▼
Land Records   Acquisition Cases
                   │
          ┌────────┼─────────┐
          │        │         │
          ▼        ▼         ▼
      Verification Events  Compensation
                              │
                              ▼
                       Payment / Release
```

### Important identifiers

- **Case ID** — Identifies an individual land acquisition process.
- **Land ID** — Identifies the associated land record.
- **User ID** — Identifies the user/landowner or system user.

Foreign-key relationships help maintain consistency between related records.

---

# 🔒 Security & Data Integrity

The application incorporates several mechanisms to improve data integrity and controlled access:

- Role-based authorization
- JWT-based authentication
- Database-backed user verification
- Relational database constraints
- Foreign-key relationships
- Transaction handling for related database operations
- Server-side validation
- Environment-based configuration for sensitive credentials

> Production deployments should keep database passwords, JWT secrets, API keys, and other credentials outside the public repository.

---

# 🔌 Application Architecture

```text
                 ┌──────────────────────┐
                 │      Frontend        │
                 │ HTML + CSS + JS      │
                 └──────────┬───────────┘
                            │
                            │ HTTP / API
                            ▼
                 ┌──────────────────────┐
                 │ Node.js + Express    │
                 │ Backend / REST APIs  │
                 └──────────┬───────────┘
                            │
                            │ SQL Queries
                            ▼
                 ┌──────────────────────┐
                 │       MySQL          │
                 │     Database         │
                 └──────────────────────┘


              LandSetu Application
                       │
                       │ Compensation
                       ▼
             ┌─────────────────────┐
             │ ML Prediction App   │
             │ Python + Streamlit  │
             └─────────────────────┘
```

---

# 👨‍💻 Development Contribution

## Main Developer — Full Stack

I served as the **main developer and Full Stack Developer** for the LandSetu project.

My primary responsibilities included:

- Designing and implementing the application architecture
- Developing the frontend using HTML, CSS, and JavaScript
- Developing the Node.js / Express backend
- Building and connecting backend APIs
- Designing and integrating the MySQL database
- Implementing authentication and role-based access
- Connecting frontend components with backend APIs
- Implementing acquisition case management functionality
- Working on compensation-related workflows
- Integrating the ML compensation-prediction component
- Debugging and testing the application
- Deploying and maintaining the web application
- Structuring the project repository and development workflow

The project was developed as a team effort, with different members contributing to presentation, domain understanding, UI/prototype work, and other project responsibilities.

---

# 📈 Project Impact

LandSetu is designed to address practical problems in land acquisition administration by providing:

### Transparency

Citizens and authorized officials can access relevant case information and follow the progress of an acquisition.

### Traceability

Important case events can be recorded digitally, creating a structured history of the acquisition process.

### Reduced Manual Dependency

Digitizing records and workflows can reduce dependence on physical documents and repeated manual tracking.

### Centralized Information

Land, acquisition, verification, and compensation information can be managed through one connected system.

### Data-Driven Compensation Support

The ML module provides an additional estimation layer that can assist with compensation analysis based on available input data.

### Role-Based Administration

Different stakeholders can access functionality relevant to their responsibilities.

---

# 🚀 Live Applications

## Main LandSetu Application

https://land-setu.onrender.com

## ML Compensation Prediction Demo

https://landacqprediction.streamlit.app/

---

# 🔗 Project Repositories

### Main LandSetu Repository

https://github.com/suroj003/Land_setu

### Land Acquisition Prediction Repository

https://github.com/suroj003/Land_acq_prediction

---

# 👨‍👩‍👧‍👦 Team

**Team Name:** INNOVA21  
**Team ID:** NITS_021  
**Institute:** NIT Silchar  
**Event:** Smart India Hackathon (SIH)

---

# 🎯 Future Scope

Possible future enhancements include:

- Integration with official government land records where permitted
- GIS/map-based land visualization
- Digital document verification
- Notifications through SMS/email
- More detailed audit trails
- Advanced analytics dashboards
- Integration with additional government departments
- Improved ML models using larger verified datasets
- Model explainability for compensation estimates
- Multi-state and multilingual support
- Digital payment-system integration
- Stronger production-grade security and monitoring

---

# 📜 Disclaimer

The ML compensation prediction module is intended as a **decision-support and estimation tool**. Its output should not be treated as a legally binding determination of compensation. Actual compensation should follow applicable laws, regulations, official valuation procedures, and authorized government decisions.

---

# ⭐ LandSetu

**LandSetu — Connecting Land, People, Departments and Transparent Acquisition Workflows.**

Built by **Team INNOVA21 | NITS_021 | NIT Silchar** for **Smart India Hackathon**.
