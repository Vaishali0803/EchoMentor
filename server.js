const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'echomentor_secret_key'; // For demonstration

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Dummy user database for demonstration
const users = [
    { email: 'test@example.com', password: 'password123', name: 'Test User' }
];

app.post('/api/signup', (req, res) => {
    const { name, email, password } = req.body;
    
    // Simple validation
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }
    
    // Check if user exists
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    
    // Create new user
    const newUser = { name, email, password };
    users.push(newUser);
    
    // In a real app we'd hash the password and save to DB
    res.status(201).json({ success: true, message: 'User created successfully' });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    // Check credentials
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        // Generate a token
        const token = jwt.sign({ email: user.email, name: user.name }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ success: true, token, name: user.name });
    } else {
        res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
