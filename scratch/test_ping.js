fetch('https://hour-60kr.onrender.com/api/health')
  .then(res => {
    console.log('Status:', res.status);
    return res.text();
  })
  .then(text => console.log('Body:', text))
  .catch(console.error);
