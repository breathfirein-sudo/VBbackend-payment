const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const period = '1m';
    const to = new Date();
    const from = new Date(to.getTime() - (200 * 60 * 1000 * 3)); 
    console.log('Querying TSLA from', from, 'to', to, 'interval', period);
    const result = await yahooFinance.chart('TSLA', { period1: from, period2: to, interval: period });
    console.log('Result quotes length:', result?.quotes?.length);
    if (result && result.quotes && result.quotes.length > 0) {
      console.log('First quote:', result.quotes[0]);
    } else {
      console.log('No quotes returned:', result);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}
test();
