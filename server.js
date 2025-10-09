// 1. Import Dependencies
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { protect } = require('./middleware/authMiddleware');

// 2. Setup App
const app = express();

// A more secure CORS setup for production
const allowedOrigins = [
  'http://localhost:3000', // for local development if you have a separate frontend server
  process.env.FRONTEND_URL  // Vercel will provide this URL
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  }
}));

app.use(express.json());

// 3. Database Connection Config
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

// 4. API Endpoints (Routes)

// --- SIGN UP ROUTE ---
app.post('/api/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Please provide a username and password." });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    const connection = await mysql.createConnection(dbConfig);
    await connection.execute(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );
    await connection.end();

    res.status(201).json({ message: "User created successfully!" });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: "This username is already taken." });
    }
    console.error(error);
    res.status(500).json({ error: "An error occurred during sign up." });
  }
});

// --- LOGIN ROUTE ---
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const connection = await mysql.createConnection(dbConfig);
    const [users] = await connection.execute('SELECT * FROM users WHERE username = ?', [username]);

    if (users.length === 0) {
      await connection.end();
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      await connection.end();
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const [profiles] = await connection.execute('SELECT * FROM user_profiles WHERE user_id = ?', [user.id]);
    await connection.end();

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({
      message: "Logged in successfully",
      token,
      profileExists: profiles.length > 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred." });
  }
});

// --- REUSABLE WORKOUT GENERATION FUNCTION ---
async function generateAndSaveWorkout(userId, connection) {
  const [rows] = await connection.execute('SELECT * FROM user_profiles WHERE user_id = ?', [userId]);
  if (rows.length === 0) throw new Error("User profile not found for workout generation.");
  const userProfile = rows[0];

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const systemPrompt = `You are Workout Genie, an expert fitness coach. Your task is to create a personalized weekly workout split. The plan should be tailored to the user's workout location (gym or home). First, provide a short, encouraging summary. Then, provide the weekly split. For each day, specify its focus. For each exercise, list its name, sets, reps, and the primary muscle group targeted.`;

  const userPrompt = `Generate a workout plan for me. My details are:
    - Name: ${userProfile.name}
    - Date of Birth: ${userProfile.dob}
    - Workout Location: ${userProfile.workout_location}
    - Gender: ${userProfile.gender}
    - Height: ${userProfile.height} cm
    - Weight: ${userProfile.weight} kg
    - Goal Weight: ${userProfile.goal_weight} kg
    - Experience: ${userProfile.experience}
    - Mentioned Health Issues: ${userProfile.health_issues}`;

  const payload = {
    contents: [{ parts: [{ text: userPrompt }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "summary": { "type": "STRING" },
          "weeklySplit": {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "day": { "type": "STRING" },
                "focus": { "type": "STRING" },
                "exercises": {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      "name": { "type": "STRING" },
                      "sets": { "type": "STRING" },
                      "reps": { "type": "STRING" },
                      "targetMuscle": { "type": "STRING" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const geminiResponse = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    console.error("Gemini API Error:", errorText);
    throw new Error("Failed to fetch from Gemini API");
  }

  const geminiResult = await geminiResponse.json();

  // Get the raw text response
  const rawText = geminiResult.candidates[0].content.parts[0].text;

  // Clean the text - remove any extra characters
  let cleanedText = rawText.trim();

  // Try to parse as JSON
  let planData;
  try {
    planData = JSON.parse(cleanedText);
  } catch (parseError) {
    console.error("Error parsing Gemini response:", parseError);
    console.log("Raw response:", rawText);
    throw new Error("Failed to parse Gemini response as JSON");
  }

  // Validate planData structure
  if (!planData || typeof planData !== 'object') {
    throw new Error("Invalid planData structure from Gemini.");
  }

  if (!planData.summary || !Array.isArray(planData.weeklySplit)) {
    throw new Error("Missing required fields in plan data");
  }

  // Ensure planData is a plain object (no functions, no circular references)
  const plainPlanData = JSON.parse(JSON.stringify(planData));

  // Convert to string safely
  const planDetailsString = JSON.stringify(plainPlanData);

  await connection.execute('UPDATE workouts SET is_active = FALSE WHERE user_id = ?', [userId]);
  await connection.execute(
    'INSERT INTO workouts (user_id, summary, plan_details, is_active) VALUES (?, ?, ?, TRUE)',
    [userId, planData.summary, planDetailsString]
  );

  return planData;
}

// --- CREATE/UPDATE PROFILE & GENERATE FIRST WORKOUT ---
app.post('/api/update-profile', protect, async (req, res) => {
  const userId = req.userId;
  let { name, dob, gender, height, weight, goalWeight, experience, workoutLocation, healthIssues } = req.body;

  if (!healthIssues || healthIssues.trim().toLowerCase() === 'none' || healthIssues.trim() === '') {
    healthIssues = 'None';
  }

  const sql = `
        INSERT INTO user_profiles (user_id, name, dob, gender, height, weight, goal_weight, experience, workout_location, health_issues)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        name = VALUES(name), dob = VALUES(dob), gender = VALUES(gender), height = VALUES(height), weight = VALUES(weight), goal_weight = VALUES(goal_weight), experience = VALUES(experience), workout_location = VALUES(workout_location), health_issues = VALUES(health_issues);
    `;

  try {
    const connection = await mysql.createConnection(dbConfig);
    await connection.execute(sql, [userId, name, dob, gender, height, weight, goalWeight, experience, workoutLocation, healthIssues]);

    const firstPlan = await generateAndSaveWorkout(userId, connection);

    await connection.end();
    res.status(201).json(firstPlan);
  } catch (error) {
    console.error("Error updating profile and generating plan:", error);
    res.status(500).json({ error: "Failed to save profile and generate plan." });
  }
});

// --- GET HOME PAGE DATA ROUTE ---
app.get('/api/home-data', protect, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT name, height, weight, week_count FROM user_profiles WHERE user_id = ?', [req.userId]);
    await connection.end();

    if (rows.length === 0) {
      return res.status(404).json({ error: "Profile not found." });
    }

    const profile = rows[0];
    const heightInMeters = profile.height / 100;
    const bmi = (profile.weight / (heightInMeters * heightInMeters)).toFixed(1);

    res.json({
      name: profile.name,
      height: profile.height,
      weight: profile.weight,
      weekCount: profile.week_count,
      bmi: bmi
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch home data." });
  }
});

// --- START NEXT WEEK ROUTE ---
app.post('/api/start-next-week', protect, async (req, res) => {
  try {
    const { newWeight } = req.body;
    const userId = req.userId;

    const connection = await mysql.createConnection(dbConfig);
    await connection.execute(
      'UPDATE user_profiles SET weight = ?, week_count = week_count + 1 WHERE user_id = ?',
      [newWeight, userId]
    );

    const newPlan = await generateAndSaveWorkout(userId, connection);

    await connection.end();
    res.status(201).json(newPlan);
  } catch (error) {
    console.error("Error starting next week:", error);
    res.status(500).json({ error: "Failed to start next week." });
  }
});

// --- GENERATE WORKOUT ON DEMAND (FOR FIRST WORKOUT) ---
app.post('/api/generate-workout', protect, async (req, res) => {
  try {
    const userId = req.userId;
    const connection = await mysql.createConnection(dbConfig);
    const newPlan = await generateAndSaveWorkout(userId, connection);
    await connection.end();
    res.status(201).json(newPlan);
  } catch (error) {
    console.error("Error generating workout on demand:", error);
    res.status(500).json({ error: "Failed to generate workout plan." });
  }
});


// --- GET ACTIVE WORKOUT ROUTE ---
app.get('/api/active-workout', protect, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT summary, plan_details FROM workouts WHERE user_id = ? AND is_active = TRUE ORDER BY id DESC LIMIT 1', [req.userId]);
    await connection.end();

    if (rows.length === 0) {
      return res.status(404).json({ error: "No active workout found." });
    }

    const row = rows[0];

    // Safely parse plan_details
    let planDetails = {};
    try {
      if (row.plan_details) {
        planDetails = JSON.parse(row.plan_details);

        // Ensure we have a summary
        if (!planDetails.summary) {
          planDetails.summary = row.summary;
        }
      } else {
        // Fallback if no plan_details
        planDetails = {
          summary: row.summary,
          weeklySplit: []
        };
      }
    } catch (parseError) {
      console.error("Error parsing plan_details:", parseError);
      return res.status(500).json({ error: "Invalid workout data format." });
    }

    res.json(planDetails);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch active workout." });
  }
});

// 5. Start the Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});