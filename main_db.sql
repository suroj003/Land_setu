


-- =====================================================
-- 1. USERS
-- =====================================================

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(100) NOT NULL UNIQUE,

    name VARCHAR(150) NOT NULL,

    email VARCHAR(150) NOT NULL UNIQUE,

    password_hash VARCHAR(255) NOT NULL,

    phone VARCHAR(15),

    role ENUM(
        'citizen',
        'officer',
        'admin'
    ) NOT NULL DEFAULT 'citizen',

    district VARCHAR(100),

    account_status ENUM(
        'active',
        'inactive'
    ) NOT NULL DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =====================================================
-- 2. PROJECTS
-- =====================================================

CREATE TABLE projects (
    project_id INT AUTO_INCREMENT PRIMARY KEY,

    project_name VARCHAR(200) NOT NULL UNIQUE,

    description TEXT,

    department VARCHAR(150),

    district VARCHAR(100) NOT NULL,

    state VARCHAR(100) NOT NULL,

    target_date DATE,

    status ENUM(
        'planned',
        'ongoing',
        'completed'
    ) NOT NULL DEFAULT 'planned',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);


-- =====================================================
-- 3. LAND
-- =====================================================

CREATE TABLE land (
    land_id INT AUTO_INCREMENT PRIMARY KEY,

    land_code VARCHAR(50) NOT NULL UNIQUE,

    owner_id INT NOT NULL,

    project_id INT,

    survey_number VARCHAR(100) NOT NULL,

    area_acres DECIMAL(10,2) NOT NULL,

    village VARCHAR(100) NOT NULL,

    district VARCHAR(100) NOT NULL,

    state VARCHAR(100) NOT NULL,

    land_type ENUM(
        'agricultural',
        'residential',
        'commercial',
        'government',
        'other'
    ) NOT NULL DEFAULT 'agricultural',

    status ENUM(
        'pending',
        'under_review',
        'verification',
        'compensation',
        'acquired'
    ) NOT NULL DEFAULT 'pending',

    latitude DECIMAL(10,7),

    longitude DECIMAL(10,7),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_land_owner
        FOREIGN KEY (owner_id)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_land_project
        FOREIGN KEY (project_id)
        REFERENCES projects(project_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT unique_survey_location
        UNIQUE (
            survey_number,
            village,
            district
        ),

    CONSTRAINT chk_land_area
        CHECK (area_acres > 0)
);


-- =====================================================
-- 4. ACQUISITION CASES
-- =====================================================

CREATE TABLE acquisition_cases (
    case_id INT AUTO_INCREMENT PRIMARY KEY,

    case_number VARCHAR(50) NOT NULL UNIQUE,

    land_id INT NOT NULL,

    project_id INT NOT NULL,

    officer_id INT,

    status ENUM(
        'application_submitted',
        'document_review',
        'land_verification',
        'notification_issued',
        'objection_period',
        'compensation_pending',
        'approved',
        'rejected',
        'completed',
        'disputed'
    ) NOT NULL DEFAULT 'application_submitted',

    application_date DATE NOT NULL,

    expected_completion_date DATE,

    remarks TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_case_land
        FOREIGN KEY (land_id)
        REFERENCES land(land_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_case_project
        FOREIGN KEY (project_id)
        REFERENCES projects(project_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_case_officer
        FOREIGN KEY (officer_id)
        REFERENCES users(user_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);


-- =====================================================
-- 5. CASE STATUS HISTORY
-- =====================================================

CREATE TABLE case_status_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,

    case_id INT NOT NULL,

    changed_by INT NOT NULL,

    old_status VARCHAR(100),

    new_status VARCHAR(100) NOT NULL,

    remarks TEXT,

    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_history_case
        FOREIGN KEY (case_id)
        REFERENCES acquisition_cases(case_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_history_user
        FOREIGN KEY (changed_by)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- =====================================================
-- 6. DOCUMENTS
-- =====================================================

CREATE TABLE documents (
    document_id INT AUTO_INCREMENT PRIMARY KEY,

    case_id INT NOT NULL,

    uploaded_by INT NOT NULL,

    document_type ENUM(
        'land_record',
        'identity_proof',
        'bank_details',
        'sale_deed',
        'ownership_proof',
        'valuation_report',
        'notice',
        'other'
    ) NOT NULL,

    file_name VARCHAR(255) NOT NULL,

    file_url VARCHAR(500),

    verification_status ENUM(
        'pending',
        'verified',
        'under_review',
        'rejected'
    ) NOT NULL DEFAULT 'pending',

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_document_case
        FOREIGN KEY (case_id)
        REFERENCES acquisition_cases(case_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_document_user
        FOREIGN KEY (uploaded_by)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);


-- =====================================================
-- 7. COMPENSATION
-- =====================================================

CREATE TABLE compensation (
    compensation_id INT AUTO_INCREMENT PRIMARY KEY,

    case_id INT NOT NULL UNIQUE,

    assessed_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

    approved_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

    paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

    payment_reference VARCHAR(150),

    payment_date DATE,

    payment_status ENUM(
        'pending',
        'approved',
        'processing',
        'partially_paid',
        'paid'
    ) NOT NULL DEFAULT 'pending',

    remarks TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_compensation_case
        FOREIGN KEY (case_id)
        REFERENCES acquisition_cases(case_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT chk_assessed
        CHECK (assessed_amount >= 0),

    CONSTRAINT chk_approved
        CHECK (approved_amount >= 0),

    CONSTRAINT chk_paid
        CHECK (paid_amount >= 0)
);


-- =====================================================
-- 8. GRIEVANCES
-- =====================================================

CREATE TABLE grievances (
    grievance_id INT AUTO_INCREMENT PRIMARY KEY,

    grievance_number VARCHAR(50) NOT NULL UNIQUE,

    case_id INT NOT NULL,

    citizen_id INT NOT NULL,

    assigned_officer_id INT,

    category ENUM(
        'land',
        'document',
        'acquisition',
        'compensation',
        'other'
    ) NOT NULL,

    subject VARCHAR(200) NOT NULL,

    description TEXT NOT NULL,

    status ENUM(
        'open',
        'under_review',
        'resolved',
        'rejected'
    ) NOT NULL DEFAULT 'open',

    resolution TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    resolved_at TIMESTAMP NULL,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_grievance_case
        FOREIGN KEY (case_id)
        REFERENCES acquisition_cases(case_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_grievance_citizen
        FOREIGN KEY (citizen_id)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,

    CONSTRAINT fk_grievance_officer
        FOREIGN KEY (assigned_officer_id)
        REFERENCES users(user_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);


-- =====================================================
-- 9. NOTIFICATIONS
-- =====================================================

CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL,

    title VARCHAR(200) NOT NULL,

    message TEXT NOT NULL,

    is_read BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notification_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);


-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_land_owner
ON land(owner_id);

CREATE INDEX idx_land_project
ON land(project_id);

CREATE INDEX idx_land_location
ON land(district, village);

CREATE INDEX idx_land_status
ON land(status);

CREATE INDEX idx_case_land
ON acquisition_cases(land_id);

CREATE INDEX idx_case_project
ON acquisition_cases(project_id);

CREATE INDEX idx_case_officer
ON acquisition_cases(officer_id);

CREATE INDEX idx_case_status
ON acquisition_cases(status);

CREATE INDEX idx_document_case
ON documents(case_id);

CREATE INDEX idx_document_status
ON documents(verification_status);

CREATE INDEX idx_compensation_status
ON compensation(payment_status);

CREATE INDEX idx_grievance_status
ON grievances(status);

CREATE INDEX idx_notification_user
ON notifications(user_id);