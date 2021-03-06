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
  console.log('incoming log message.', req.query);

  const time = moment.utc().add(3, 'hours');
  const chunks = [];

  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const query = req.query || {};
    let str = time;
    if (query.app) {
      if (query.name) {
        str += ' ' + query.app + '::' + query.name + '\r\n';
      } else {
        str += ' ' + query.app + '\r\n';
      }
    } else if (query.name) {
      str += ' ' + query.name + '\r\n';
    } else {
      str += '\r\n';
    }
    if (Object.keys(query).filter(x => x !== 'app' && x !== 'name').length > 0) {
      str += JSON.stringify(query, null, 2) + '\r\n';
    }
    str += body.toString('utf8') + '\r\n\r\n';
    console.log(str);

    io.emit('message', {
      time: time.format('HH:mm:ss.SSSSS'),
      query: query,
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
  console.log('incoming file.', req.query);

  try {
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
        .then(
          () => {
            const query = req.query || {};
            let str = time;
            if (query.app) {
              if (query.name) {
                str += ' ' + query.app + '::' + query.name + '\r\n';
              } else {
                str += ' ' + query.app + '\r\n';
              }
            } else if (query.name) {
              str += ' ' + query.name + '\r\n';
            } else {
              str += '\r\n';
            }
            if (Object.keys(query).filter(x => x !== 'app' && x !== 'name').length > 0) {
              str += JSON.stringify(query, null, 2) + '\r\n';
            }
            str += 'uploaded files:' + filenames.map(x => '\r\n' + x) + '\r\n\r\n';
            console.log(str);

            io.emit('message', {
              time: time.format('HH:mm:ss.SSSSS'),
              query: fields || {},
              body: 'uploaded files:' + filenames.map(x => '\r\n' + x),
            });

            res.writeHead(200, {
              'Content-Type': 'text/plain'
            });
            res.end('OK');
          },
          (err) => {
            console.error(err);
            io.emit('message', {
              time: moment.utc().add(3, 'hours').format('HH:mm:ss.SSSSS'),
              query: { app: 'logview', name: '/file upload error' },
              body: err.toString()
            });
          });
    });
  } catch (exc) {
    console.error(exc);
    io.emit('message', {
      time: moment.utc().add(3, 'hours').format('HH:mm:ss.SSSSS'),
      query: { app: 'logview', name: '/file upload error' },
      body: exc.toString()
    });
  }
});

server.listen(port, () => {
  console.log(`listening on ${port}.`);
});
