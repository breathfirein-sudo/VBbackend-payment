const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'supersecretkey'; // From backend/.env
const token = jwt.sign({ userId: 40, email: 'abrarali99890@gmail.com' }, JWT_SECRET, { expiresIn: '7d' });

console.log("Token:", token);

axios.get('http://localhost:5000/api/contest/leaderboard', {
  headers: {
    Authorization: `Bearer ${token}`
  }
})
.then(res => {
  console.log("SUCCESS:", res.data);
})
.catch(err => {
  console.error("ERROR status:", err.response ? err.response.status : 'no response');
  console.error("ERROR data:", err.response ? err.response.data : err.message);
});
