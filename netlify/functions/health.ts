import type { Handler } from '@netlify/functions';

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      status: 'ok',
      platform: 'netlify',
      time: new Date().toISOString()
    })
  };
};
