const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const { body, validationResult } = require("express-validator");
const mysql = require("mysql2");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.static("views"));
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs"); // optional if you want dynamic HTML later
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// MySQL connection
const db = mysql.createConnection({
  host: process.env.MYSQL_ADDON_HOST,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
});
db.connect((err) => {
  if (err) console.log("DB Error:", err);
  else console.log("DB Connected");
});

// In-memory OTP store (for testing)
let otpStore = {}; // { email: { otp: 123456, expires: timestamp } }

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Signup route (FAKE OTP MODE)
app.post(
  "/signup",
  [
    body("institute_name").notEmpty(),
    body("institute_type").notEmpty(),
    body("registration_number").notEmpty(),
    body("address").notEmpty(),
    body("admin_name").notEmpty(),
    body("admin_email").isEmail(),
    body("admin_mobile").notEmpty(),
    body("username").notEmpty(),
    body("password").isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      institute_name,
      institute_type,
      registration_number,
      address,
      admin_name,
      admin_email,
      admin_mobile,
      username,
      password,
    } = req.body;

    const password_hash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_SALT_ROUNDS)
    );

    // Insert into DB
    const sql = `INSERT INTO institutes (institute_name,institute_type,registration_number,address,admin_name,admin_email,admin_mobile,username,password_hash) VALUES (?,?,?,?,?,?,?,?,?)`;
    db.query(
      sql,
      [
        institute_name,
        institute_type,
        registration_number,
        address,
        admin_name,
        admin_email,
        admin_mobile,
        username,
        password_hash,
      ],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        // Fake OTP logic (no email sending)
        otpStore[admin_email] = { otp: 123456, expires: Date.now() + 10 * 60000 };

        res.json({
          message:
            "Signup successful! (Note: Due to server issue, OTP send nahi ho rahi. Kripya OTP: 123456 use karein verify karne ke liye.)",
        });
      }
    );
  }
);


// Verify OTP (FAKE)
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;

  if (parseInt(otp) === 123456) {
    db.query(
      "UPDATE institutes SET is_email_verified=1 WHERE admin_email=?",
      [email],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        delete otpStore[email];
        res.json({ message: "Email verified successfully!" });
      }
    );
  } else {
    res.status(400).json({ error: "Invalid OTP" });
  }
});

// Serve signup page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views/signup.html"));
});

// POST /login  -> verify username + password
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Missing credentials" });

  const sql = "SELECT * FROM institutes WHERE username = ? LIMIT 1";
  db.query(sql, [username], async (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!results || results.length === 0)
      return res.status(401).json({ error: "Invalid username or password" });

    const user = results[0];

    // check email verified
    if (user.is_email_verified != 1)
      return res.status(403).json({ error: "Email not verified" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: "Invalid username or password" });

    // send minimal institute data to frontend (no password)
    const payload = {
      id: user.id,
      institute_name: user.institute_name,
      institute_type: user.institute_type,
      address: user.address,
      admin_email: user.admin_email,
    };

    return res.json({ message: "OK", institute: payload });
  });
});

// Serve dashboard page (optional route)
app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "views/dashboard.html"));
});

// Serve login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views/login.html"));
});

// For file uploads
const multer = require("multer");
const upload = multer({ dest: "public/uploads/" });
const uploadNotes = multer({ dest: "public/notes" });

app.get("/add-student", (req, res) => {
  res.sendFile(path.join(__dirname, "views/add_student.html"));
});

// POST /add-student -> insert data
app.post("/add-student", upload.single("photo"), (req, res) => {
  const {
    student_name,
    gender,
    dob,
    contact_number,
    address,
    admission_date,
    total_fees,
    fees_paid,
    institute_id,
  } = req.body;

  const photoPath = req.file ? "/uploads/" + req.file.filename : null;

  const sql = `INSERT INTO students
    (institute_id, student_name, gender, dob, contact_number, address, admission_date, total_fees, fees_paid, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    sql,
    [
      institute_id,
      student_name,
      gender,
      dob,
      contact_number,
      address,
      admission_date,
      total_fees,
      fees_paid,
      photoPath,
    ],
    (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ message: "Student added successfully" });
    }
  );
});

// 🔍 SEARCH students
app.get("/search-students", (req, res) => {
  const { name, inst } = req.query;
  const sql = `SELECT id, student_name FROM students WHERE institute_id = ? AND student_name LIKE ? LIMIT 10`;
  db.query(sql, [inst, `%${name}%`], (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(results);
  });
});

// 🧾 GET student by ID
app.get("/student/:id", (req, res) => {
  const sql = `SELECT * FROM students WHERE id = ?`;
  db.query(sql, [req.params.id], (err, results) => {
    if (err || !results.length)
      return res.status(404).json({ error: "Not found" });
    res.json(results[0]);
  });
});

// ✏️ UPDATE student
app.put("/student/:id", (req, res) => {
  const { student_name, contact_number, address, fees_paid } = req.body;
  const sql = `UPDATE students SET student_name=?, contact_number=?, address=?, fees_paid=? WHERE id=?`;
  db.query(
    sql,
    [student_name, contact_number, address, fees_paid, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ message: "Student updated successfully" });
    }
  );
});

// ❌ DELETE student
app.delete("/student/:id", (req, res) => {
  const sql = `DELETE FROM students WHERE id = ?`;
  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ message: "Student deleted successfully" });
  });
});

// pending fees student list
app.get("/pending-fees", (req, res) => {
  const instId = req.query.inst;
  const sql = `SELECT student_name, total_fees, fees_paid
               FROM students
               WHERE institute_id = ? AND fees_paid < total_fees`;
  db.query(sql, [instId], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

//add typing students
app.post("/addTypingStudent", upload.single("photo"), (req, res) => {
  const {
    name,
    gender,
    dob,
    contact,
    address,
    admission_date,
    total_fees,
    fees_paid,
    gmail,
    batch,
  } = req.body;
  const photo = req.file ? req.file.filename : null;

  const sql = `INSERT INTO typing_students
    (name, gender, dob, contact, address, admission_date, total_fees, fees_paid, gmail, batch, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    sql,
    [
      name,
      gender,
      dob,
      contact,
      address,
      admission_date,
      total_fees,
      fees_paid,
      gmail,
      batch,
      photo,
    ],
    (err, result) => {
      if (err) return res.status(500).send("Database error");
      res.send("Typing student added successfully!");
    }
  );
});
app.use("/views", express.static(path.join(__dirname, "views")));
// View all typing students
app.get("/getTypingStudents", (req, res) => {
  const sql = "SELECT * FROM typing_students ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send("Database error");
    res.json(results);
  });
});

// Delete student
app.delete("/deleteTypingStudent/:id", (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM typing_students WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) return res.status(500).send("Error deleting record");
    res.send("Student deleted successfully");
  });
});

// Update student
app.post("/updateTypingStudent/:id", upload.single("photo"), (req, res) => {
  const { id } = req.params;
  const {
    name,
    gender,
    dob,
    contact,
    address,
    admission_date,
    total_fees,
    fees_paid,
    gmail,
    batch,
  } = req.body;
  const photo = req.file ? req.file.filename : req.body.oldPhoto;

  const sql = `UPDATE typing_students SET
    name=?, gender=?, dob=?, contact=?, address=?, admission_date=?,
    total_fees=?, fees_paid=?, gmail=?, batch=?, photo=? WHERE id=?`;

  db.query(
    sql,
    [
      name,
      gender,
      dob,
      contact,
      address,
      admission_date,
      total_fees,
      fees_paid,
      gmail,
      batch,
      photo,
      id,
    ],
    (err, result) => {
      if (err) return res.status(500).send("Update failed");
      res.send("Student updated successfully");
    }
  );
});

// Serve page
app.get("/view-typing-students", (req, res) => {
  res.sendFile(path.join(__dirname, "views/view-typing-students.html"));
});

// Get student by ID for editing
app.get("/get-typing-student/:id", (req, res) => {
  const id = req.params.id;
  db.query(
    "SELECT * FROM typing_students WHERE id = ?",
    [id],
    (err, results) => {
      if (err) return res.status(500).send("Database error");
      if (results.length === 0) return res.status(404).send("Not found");
      res.json(results[0]);
    }
  );
});

// Update student info
app.post("/update-typing-student", upload.none(), (req, res) => {
  const { id, name, contact, gmail, batch, fees_paid } = req.body;
  const sql = `UPDATE typing_students
               SET name=?, contact=?, gmail=?, batch=?, fees_paid=?
               WHERE id=?`;

  db.query(sql, [name, contact, gmail, batch, fees_paid, id], (err) => {
    if (err) return res.status(500).send("Error updating student");
    res.send("Student updated successfully!");
  });
});
//pending fees typing students

app.get("/pending-typing-fees", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "pending-typing-fees.html"));
});
// Get pending typing students
app.get("/get-pending-typing-fees", (req, res) => {
  const sql = "SELECT * FROM typing_students WHERE fees_paid < total_fees";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send("Database error");
    res.json(results);
  });
});

// Send email to pending students
app.post("/send-typing-fee-msg", express.json(), (req, res) => {
  const { message } = req.body;

  const sql = "SELECT gmail FROM typing_students WHERE fees_paid < total_fees";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send("Database error");

    const emails = results.map((r) => r.gmail);
    if (emails.length === 0) return res.send("No pending students.");

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: emails.join(","),
      subject: "Pending Fees Reminder - MSCIT Typing Batch",
      text: message,
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Failed to send emails.");
      }
      res.send("Message sent successfully to all pending students!");
    });
  });
});

// total typing students count
app.get("/totalTypingStudents", (req, res) => {
  const sql = "SELECT COUNT(*) AS total FROM typing_students";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).send("Database error");
    res.json({ total: result[0].total });
  });
});

// Add Course
app.post("/addCourse", (req, res) => {
  const { name, batch, total_fees } = req.body;
  const sql = "INSERT INTO courses (name, batch, total_fees) VALUES (?, ?, ?)";
  db.query(sql, [name, batch, total_fees], (err, result) => {
    if (err) return res.status(500).send("Database error");
    res.send("Course added successfully!");
  });
});

// Get all Courses
app.get("/getCourses", (req, res) => {
  db.query("SELECT * FROM courses", (err, result) => {
    if (err) return res.status(500).send([]);
    res.json(result);
  });
});

// Add Student for a Course
app.post("/addCourseStudent", upload.single("photo"), (req, res) => {
  const {
    course_id,
    name,
    gender,
    dob,
    contact,
    address,
    admission_date,
    fees_paid,
    gmail,
  } = req.body;

  const photo = req.file ? req.file.filename : null;

  const sql = `INSERT INTO course_students
    (course_id, name, gender, dob, contact, address, admission_date, fees_paid, gmail, photo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(
    sql,
    [
      course_id,
      name,
      gender,
      dob,
      contact,
      address,
      admission_date,
      fees_paid,
      gmail,
      photo,
    ],
    (err, result) => {
      if (err) return res.status(500).send("Database error");
      res.send("Student added successfully!");
    }
  );
});

// Get students by course
app.get("/getCourseStudents/:course_id", (req, res) => {
  const { course_id } = req.params;
  db.query(
    "SELECT * FROM course_students WHERE course_id = ?",
    [course_id],
    (err, result) => {
      if (err) return res.status(500).send([]);
      res.json(result);
    }
  );
});
// Delete a course
app.delete("/deleteCourse/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM courses WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).send("Database error");
    res.send("Course deleted successfully!");
  });
});

// Update Student
app.put("/updateStudent/:id", (req, res) => {
  const { id } = req.params;
  const { name, contact, fees_paid } = req.body;
  db.query(
    "UPDATE course_students SET name=?, contact=?, fees_paid=? WHERE id=?",
    [name, contact, fees_paid, id],
    (err) => {
      if (err) return res.status(500).send("Database error");
      res.send("Student updated successfully!");
    }
  );
});

// Delete Student
app.delete("/deleteStudent/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM course_students WHERE id=?", [id], (err) => {
    if (err) return res.status(500).send("Database error");
    res.send("Student deleted successfully!");
  });
});

// Send Course Message API
app.post("/sendCourseMessage", (req, res) => {
  const { course_id, message, sendType } = req.body;

  let query =
    "SELECT gmail, fees_paid, total_fees FROM course_students JOIN courses ON course_students.course_id = courses.id WHERE course_id = ?";
  db.query(query, [course_id], async (err, result) => {
    if (err) return res.status(500).send("Database error");

    // Filter pending students if needed
    let recipients = result;
    if (sendType === "pending") {
      recipients = result.filter((s) => s.fees_paid < s.total_fees);
    }

    if (recipients.length === 0)
      return res.send("No students found for selected option.");

    for (let student of recipients) {
      if (student.gmail) {
        await transporter.sendMail({
          from: "yourgmail@gmail.com",
          to: student.gmail,
          subject: "Message from Institute",
          text: message,
        });
      }
    }
    res.send("Messages sent successfully!");
  });
});

// Serve Create Test Page
app.get("/create-test", (req, res) => {
  res.sendFile(path.join(__dirname, "views/create_test.html"));
});

// Save Test + Questions
app.post("/save-test", async (req, res) => {
  const { test_name, course_name, questions } = req.body;

  if (!test_name || !course_name || !questions || questions.length === 0)
    return res.status(400).json({ error: "Invalid data" });

  // Insert test
  db.query(
    "INSERT INTO tests (test_name, course_name) VALUES (?, ?)",
    [test_name, course_name],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const test_id = result.insertId;

      // Insert questions
      const qValues = questions.map((q) => [
        test_id,
        q.question_text,
        q.marks,
        q.option_a,
        q.option_b,
        q.option_c,
        q.option_d,
        q.correct_option,
      ]);

      db.query(
        `INSERT INTO test_questions
              (test_id, question_text, marks, option_a, option_b, option_c, option_d, correct_option)
              VALUES ?`,
        [qValues],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ message: "Test saved successfully!" });
        }
      );
    }
  );
});

// Get all tests
app.get("/view-tests", (req, res) => {
  res.sendFile(path.join(__dirname, "views/view-tests.html"));
});
app.get("/get-tests", (req, res) => {
  db.query("SELECT * FROM tests ORDER BY created_at DESC", (err, results) => {
    if (err) return res.status(500).send([]);
    res.json(results);
  });
});

// Get questions for a specific test
app.get("/get-test-questions/:test_id", (req, res) => {
  const test_id = req.params.test_id;
  db.query(
    "SELECT * FROM test_questions WHERE test_id = ?",
    [test_id],
    (err, results) => {
      if (err) return res.status(500).send([]);
      res.json(results);
    }
  );
});

// Fetch all tests
app.get("/api/get-tests", (req, res) => {
  db.query("SELECT * FROM tests", (err, results) => {
    if (err) return res.status(500).send("DB Error");
    res.json(results);
  });
});

// Delete test
app.delete("/api/delete-test/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM tests WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).send("Error deleting test");
    res.send("Test deleted successfully!");
  });
});

//link se take-test page pe redirect
// Serve Take Test Page
app.get("/take-test/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "views/take-test.html"));
});

// Save student test result
app.post("/api/submit-test", (req, res) => {
  const { test_id, name, course, email, answers } = req.body;

  if (!test_id || !name || !course || !email || !answers)
    return res.status(400).json({ error: "Invalid data" });

  // Pehle saare questions fetch kar ke marks check karte hai
  db.query(
    "SELECT * FROM test_questions WHERE test_id = ?",
    [test_id],
    (err, questions) => {
      if (err) return res.status(500).json({ error: err.message });

      let totalMarks = 0;
      questions.forEach((q) => {
        const given = answers[q.id]; // user ne kya select kiya
        if (given && given.toUpperCase() === q.correct_option.toUpperCase()) {
          totalMarks += q.marks;
        }
      });

      // Ab student ka result store karte hai
      db.query(
        "INSERT INTO student_results (test_id, name, course, email, total_marks) VALUES (?, ?, ?, ?, ?)",
        [test_id, name, course, email, totalMarks],
        (err2) => {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({
            message: "Test submitted successfully!",
            total: totalMarks,
          });
        }
      );
    }
  );
});
// Serve results page
app.get("/view-results", (req, res) => {
  res.sendFile(path.join(__dirname, "views/view-results.html"));
});

// Get all student results in dashboard result btn
app.get("/api/get-results", (req, res) => {
  db.query(
    `SELECT r.id, r.name, r.course, r.email, r.total_marks, r.submitted_at, t.test_name
     FROM student_results r
     JOIN tests t ON r.test_id = t.id
     ORDER BY r.submitted_at DESC`,
    (err, results) => {
      if (err) return res.status(500).send([]);
      res.json(results);
    }
  );
});

// Delete result
app.delete("/api/delete-result/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM student_results WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).send("Error deleting result");
    res.send("Result deleted successfully!");
  });
});

// Send all results by email all students.
app.post("/api/send-all-results", (req, res) => {
  db.query(
    `SELECT r.name, r.course, r.email, r.total_marks, r.submitted_at, t.test_name
     FROM student_results r
     JOIN tests t ON r.test_id = t.id`,
    async (err, results) => {
      if (err) return res.status(500).send("DB Error");

      if (!results.length) return res.status(400).send("No results found.");

      for (const r of results) {
        const mailOptions = {
          from: "YOUR_EMAIL@gmail.com", // ← tu yaha apna set wala sender daal
          to: r.email,
          subject: `Your Test Result - ${r.test_name}`,
          html: `
            <h3>Test Result Summary</h3>
            <p><b>Test:</b> ${r.test_name}</p>
            <p><b>Name:</b> ${r.name}</p>
            <p><b>Course:</b> ${r.course}</p>
            <p><b>Marks:</b> ${r.total_marks}</p>
            <p><b>Submitted:</b> ${new Date(
              r.submitted_at
            ).toLocaleString()}</p>
            <p>Thank you for appearing in the test.</p>
          `,
        };

        try {
          await transporter.sendMail(mailOptions);
        } catch (e) {
          console.error(`Error sending to ${r.email}:`, e.message);
        }
      }

      res.send("Results sent successfully to all students!");
    }
  );
});

//send notes from student to email

app.post("/send-course-notes", uploadNotes.single("file"), (req, res) => {
  const { course_id } = req.body;
  const filePath = req.file ? req.file.path : null;

  if (!course_id || !filePath) return res.status(400).send("Missing data");

  // Fetch students for the course
  db.query(
    "SELECT gmail, name FROM course_students WHERE course_id = ?",
    [course_id],
    async (err, students) => {
      if (err) return res.status(500).send("Database error");

      for (let s of students) {
        try {
          await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: s.gmail,
            subject: `Notes for your course`,
            text: `Hello ${s.name},\nPlease find attached notes for your course.`,
            attachments: [{ path: filePath }],
          });
        } catch (e) {
          console.error(`Error sending to ${s.gmail}: ${e.message}`);
        }
      }
      res.send("Notes sent successfully to all students!");
    }
  );
});
// Check if student already attempted
app.get("/api/check-attempt", (req, res) => {
  const { test_id, email } = req.query;
  if (!test_id || !email) return res.json({ attempted: false });

  const sql =
    "SELECT COUNT(*) AS cnt FROM student_results WHERE test_id=? AND email=?";
  db.query(sql, [test_id, email], (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ attempted: results[0].cnt > 0 });
  });
});
// Folder for uploads
const examFolder = path.join(__dirname, "public/uploads/exams");
if (!fs.existsSync(examFolder)) fs.mkdirSync(examFolder, { recursive: true });

// Multer setup
const examStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, examFolder),
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 10) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});
const examUpload = multer({
  storage: examStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
});

// Serve the form
app.get("/exam-form", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "exam-form.html"));
});

// Handle form submission
app.post(
  "/submit-exam-form",
  examUpload.fields([
    { name: "adhar_card", maxCount: 1 },
    { name: "photo", maxCount: 1 },
    { name: "tc", maxCount: 1 },
    { name: "marksheet", maxCount: 1 },
  ]),
  (req, res) => {
    const {
      full_name,
      father_name,
      dob,
      sex,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      subject,
      aadhaar,
      mobile,
      tenth_percent,
      twelfth_percent,
    } = req.body;

    if (!full_name || !mobile)
      return res.status(400).send("Full name and mobile are required.");

    const aadhaarMasked =
      aadhaar && aadhaar.length === 12
        ? "XXXX-XXXX-" + aadhaar.slice(-4)
        : null;
    const aadhaarHash = aadhaar
      ? crypto
          .createHmac("sha256", "secret_key_123")
          .update(aadhaar)
          .digest("hex")
      : null;

    const sql =
      "INSERT INTO exam_registrations (full_name,father_name,dob,sex,address_line1,address_line2,city,state,pincode,subject,aadhaar_masked,aadhaar_hash,mobile,tenth_percent,twelfth_percent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
    const values = [
      full_name,
      father_name,
      dob,
      sex,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      subject,
      aadhaarMasked,
      aadhaarHash,
      mobile,
      tenth_percent,
      twelfth_percent,
    ];

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error("DB error:", err);
        return res.status(500).send("Database error");
      }

      const regId = result.insertId;
      const filesToSave = ["adhar_card", "photo", "tc", "marksheet"];
      filesToSave.forEach((field) => {
        if (req.files[field]) {
          const f = req.files[field][0];
          db.query(
            "INSERT INTO exam_attachments (registration_id, filename, original_name, mime_type, size_bytes) VALUES (?,?,?,?,?)",
            [regId, f.filename, f.originalname, f.mimetype, f.size]
          );
        }
      });

      res.send("✅ Form submitted successfully!");
    });
  }
);

// Admin get all
app.get("/exam-forms", (req, res) => {
  db.query("SELECT * FROM exam_registrations ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});

// View single registration with attachments
app.get("/exam-form/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM exam_registrations WHERE id=?", [id], (err, rows) => {
    if (err || !rows.length) return res.status(404).send("Not found");

    db.query(
      "SELECT * FROM exam_attachments WHERE registration_id=?",
      [id],
      (err2, files) => {
        if (err2) return res.status(500).send("DB error");
        res.json({ registration: rows[0], attachments: files });
      }
    );
  });
});

// Get all exams (admin)
app.get("/exam-forms", (req, res) => {
  db.query("SELECT * FROM exam_registrations ORDER BY id DESC", (err, rows) => {
    if (err) return res.status(500).send("DB error");
    res.json(rows);
  });
});

// View single exam registration
app.get("/exam-form/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM exam_registrations WHERE id=?", [id], (err, rows) => {
    if (err || !rows.length) return res.status(404).send("Not found");
    db.query(
      "SELECT * FROM exam_attachments WHERE registration_id=?",
      [id],
      (err2, files) => {
        if (err2) return res.status(500).send("DB error");
        res.json({ registration: rows[0], attachments: files });
      }
    );
  });
});

//student exam data search page
// Serve exam-students page
app.get("/exam-students", (req, res) => {
  res.sendFile(path.join(__dirname, "views/exam-students.html"));
});

// API: Get all students (with search)
app.get("/api/exam-students", (req, res) => {
  const search = req.query.search ? `%${req.query.search}%` : "%";
  const sql =
    "SELECT id, full_name, mobile, subject FROM exam_registrations WHERE full_name LIKE ? ORDER BY id DESC";
  db.query(sql, [search], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(rows);
  });
});

// API: Get single student + attachments
app.get("/api/exam-student/:id", (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM exam_registrations WHERE id=?", [id], (err, rows) => {
    if (err || !rows.length)
      return res.status(404).json({ error: "Not found" });

    db.query(
      "SELECT * FROM exam_attachments WHERE registration_id=?",
      [id],
      (err2, files) => {
        if (err2) return res.status(500).json({ error: "DB error" });

        // safe attachments grouping
        const attachments = {
          aadhaar: [],
          photo: [],
          tc: [],
          marksheet: [],
          others: [],
        };

        if (files && files.length) {
          files.forEach((f) => {
            const name = f.original_name ? f.original_name.toLowerCase() : "";
            if (name.includes("aadhaar")) attachments.aadhaar.push(f);
            else if (name.includes("photo")) attachments.photo.push(f);
            else if (name.includes("tc")) attachments.tc.push(f);
            else if (name.includes("marksheet")) attachments.marksheet.push(f);
            else attachments.others.push(f);
          });
        }

        res.json({ registration: rows[0], attachments });
      }
    );
  });
});

app.put("/api/exam-student/:id", (req, res) => {
  const { id } = req.params;
  const d = req.body;

  // null-safe conversions
  const safe = (v) => (v && v.trim() !== "" ? v.trim() : null);
  const toNum = (v) => (v && !isNaN(v) ? parseFloat(v) : null);

  const sql = `
    UPDATE exam_registrations
    SET
      father_name = ?,
      dob = ?,
      sex = ?,
      address_line1 = ?,
      address_line2 = ?,
      city = ?,
      state = ?,
      pincode = ?,
      subject = ?,
      mobile = ?,
      tenth_percent = ?,
      twelfth_percent = ?
    WHERE id = ?`;

  const vals = [
    safe(d.father_name),
    d.dob ? new Date(d.dob).toISOString().split("T")[0] : null,
    safe(d.sex),
    safe(d.address_line1),
    safe(d.address_line2),
    safe(d.city),
    safe(d.state),
    safe(d.pincode),
    safe(d.subject),
    safe(d.mobile),
    toNum(d.tenth_percent),
    toNum(d.twelfth_percent),
    id,
  ];

  db.query(sql, vals, (err) => {
    if (err) {
      console.error("Update error:", err.sqlMessage);
      return res.status(500).json({ error: err.sqlMessage });
    }
    res.json({ success: true });
  });
   
});

// API: Delete student
app.delete("/api/exam-student/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM exam_registrations WHERE id=?", [id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    db.query("DELETE FROM exam_attachments WHERE registration_id=?", [id]);
    res.json({ success: true });
  });
});

// app.listen(process.env.PORT, () =>
//   console.log(`Server running on port ${process.env.PORT}`)
// );
const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=>{
  console.log(`server running on port ${PORT}`);
});