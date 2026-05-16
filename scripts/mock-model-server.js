const http = require('http');

const port = Number(process.env.PORT || 8787);

const models = {
  data: [
    { id: 'gpt-5-codex', object: 'model' },
    { id: 'gpt-5.1', object: 'model' },
    { id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4' },
    { id: 'deepseek-r1', object: 'model' }
  ]
};

const server = http.createServer((req, res) => {
  if (req.url === '/v1/models' || req.url === '/models') {
    res.writeHead(200, {
      'content-type': 'application/json'
    });
    res.end(JSON.stringify(models));
    return;
  }

  res.writeHead(404, {
    'content-type': 'application/json'
  });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, () => {
  console.log(`Mock model server listening on http://localhost:${port}`);
});
