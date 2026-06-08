fetch('https://hour-60kr.onrender.com/api/auth/send-otp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ email: 'test12345@invest-hour.com' })
})
.then(async res => {
  console.log('Status:', res.status);
  console.log('Headers:', Object.fromEntries(res.headers.entries()));
  console.log('Body:', await res.text());
})
.catch(console.error);
