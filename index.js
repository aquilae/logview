const fs = require('fs');
const http = require('http');
const path = require('path');

const express = require('express');
const formidable = require('formidable');
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
        query = { app: 'logview', ...query };
        const url = '/?' + Object.keys(query).map(
          key => enc(key) + '=' + enc(query[key])).join('&');
        fetch(url, { method: 'POST', body: body });
      };
      
      function enc(x) {
        return encodeURIComponent(x);
      }
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
      query: req.query || {},
      body: body.toString('utf8')
    });

    res.writeHead(200, {
      'Content-Type': 'text/plain'
    });

    res.end('OK');
  });
});

app.get('/file/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'files', req.path.substr(6)));
});

app.post('/file', (req, res) => {
  console.log('incoming file.');

  const time = moment.utc().add(3, 'hours');

  const form = new formidable.IncomingForm();

  form.parse(req, function(err, fields, files) {
    const filenames = [];

    Promise
      .all(
        Object.keys(files).map(
          (key) => new Promise((resolve, reject) => {
            const file = files[key];
            filenames.push(file.name);
            const readStream = fs.createReadStream(file.path);
            const writeStream = fs.createWriteStream(path.join('files', file.name));
            readStream.on('error', reject);
            writeStream.on('error', reject);
            writeStream.on('close', resolve);
            readStream.pipe(writeStream);
          })))
      .then(() => {
        io.emit('message', {
          time: time.format('HH:mm:ss.SSSSS'),
          query: fields || {},
          body: 'uploaded files:' + filenames.map(x => '\r\n' + x),
        });

        res.writeHead(200, {
          'Content-Type': 'text/plain'
        });
        res.end('OK');
      });
  });
});

server.listen(port, () => {
  console.log(`listening on ${port}.`);
});
