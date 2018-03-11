const http = require('http');
const express = require('express');
const moment = require('moment');
const socketIO = require('socket.io');

const port = process.env.PORT || 8500;

const app = express();
const server = http.Server(app);
const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('incoming socket.io connection.');

  socket.on('disconnect', () => {
    console.log('closed socket.io connection.');
  });
});

app.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  res.end(`
<!doctype html>
<html style="position: relative; width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;">
  <head>
    <title>logview</title>
  </head>
  <body style="position: relative; width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden;">
    <textarea id="out" style="width: 100%; height: 100%; margin: 0; padding: 0; overflow: scroll;"></textarea>
    <script src="/socket.io/socket.io.js"></script>
    <script>
      const out = document.getElementById('out');
      io().on('message', ({ time, query, body}) => {
        const autoscroll = out.scrollTop + out.clientHeight >= out.scrollHeight;
        const { app, name, ...rest } = query;
        out.value += time;
        if (app) {
          if (name) {
            out.value += ' ' + app + '::' + name + '\\r\\n'; 
          } else {
            out.value += ' ' + app + '\\r\\n';
          }
        } else if (name) {
          out.value += ' ' + name + '\\r\\n';
        } else {
          out.value += '\\r\\n';
        }
        if (Object.keys(rest).length > 0) {
          out.value += JSON.stringify(rest, null, 2) + '\\r\\n';
        }
        out.value += body + '\\r\\n\\r\\n';
        autoscroll && (out.scrollTop = out.scrollHeight);
      });
      
      window.post = function(body, query) {
        let url = '/';
        if (query) {
          url += '?' + Object.keys(query)
            .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(query[key]))
            .join('&');
        }
        fetch(url, { method: 'POST', body: body });
      };
    </script>
  </body>
</html>
`);
});

app.post('/', (req, res) => {
  console.log('incoming log message.');

  const time = moment.utc().add(3, 'hours');
  const chunks = [];

  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    io.emit('message', {
      time: time.format('HH:mm:ss.SSSSS'),
      query: { app: 'logview', ...req.query },
      body: body.toString('utf8')
    });

    res.writeHead(200, {
      'Content-Type': 'text/plain'
    });

    res.end('OK');
  });
});

server.listen(port, () => {
  console.log(`listening on ${port}.`);
});
