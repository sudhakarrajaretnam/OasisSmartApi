const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { default: mongoose } = require('mongoose');
//const { ServiceStaff } = require('./src/model/staffModel');
//const UserBasicInfo = require('./src/model/userLoginModel');
const env = process.env.NODE_ENV || 'development';
dotenv.config({path: path.join(__dirname, path.sep,`.env.${env}`) });

const app = express();
const port = process.env.PORT || 7000;
const mongoServerSelectionTimeoutMS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.raw());

const corsOptions = {
    origin: true,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
};
app.use(cors(corsOptions));
app.use(cookieParser());

const sanitizeMongoUri = (uri = '') => uri.replace(/\/\/([^@]+)@/, '//<credentials>@');

const buildMongoUriList = () => {
    const uris = [process.env.OASSIS_DB_URL, process.env.OASSIS_DB_FALLBACK_URL]
        .filter(Boolean)
        .filter((uri, index, all) => all.indexOf(uri) === index);

    if (uris.length === 0) {
        throw new Error('Missing MongoDB connection string. Set OASSIS_DB_URL in the environment.');
    }

    return uris;
};

const logMongoConnectionError = (error, uri) => {
    console.error(`Error connecting to MongoDB with ${sanitizeMongoUri(uri)}:`, error);

    if (error?.code === 'ETIMEOUT' && error?.syscall === 'querySrv') {
        console.error(
            'MongoDB SRV lookup timed out. This usually means Node could not resolve the Atlas DNS record. ' +
            'If this keeps happening, either fix DNS/network access or set OASSIS_DB_FALLBACK_URL to a direct mongodb:// replica-set URI.'
        );
    }

    if (error?.name === 'MongooseServerSelectionError') {
        console.error(
            'MongoDB server selection failed. Check Atlas IP access rules and whether outbound TCP 27017 is allowed from this machine/network.'
        );
    }
};

const connectToMongo = async () => {
    const mongoUris = buildMongoUriList();
    let lastError;

    for (const [index, uri] of mongoUris.entries()) {
        try {
            if (index > 0) {
                console.log(`Retrying MongoDB connection using fallback URI ${index + 1}/${mongoUris.length}...`);
            }

            await mongoose.connect(uri, {
                serverSelectionTimeoutMS: mongoServerSelectionTimeoutMS,
            });

            console.log('Connected to MongoDB');
            return;
        } catch (error) {
            lastError = error;
            logMongoConnectionError(error, uri);
            await mongoose.disconnect().catch(() => {});
        }
    }

    throw lastError;
};

mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error after startup:', error);
});

app.get('/', async (req, res) => {
    //console.log('here');
    //res.send('Hello World!');

    //await ServiceStaff.updateMany({}, { $set: { disabled: false } });
    res.send('done');
    //res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/auth', require('./src/routes/authRoutes'));
app.use('/buy', [
    require('./src/routes/buyRoutes'),
    require('./src/routes/buySearchRoute'),
]);
app.use('/service', [
    require('./src/routes/serviceEntryRoutes'),
    require('./src/routes/serviceStaffRoute'),
    require('./src/routes/serviceSearchRoute'),
]);
app.use('/mobile/grocery', [
    require('./src/routes/mobile/groceryRoutes'),
    require('./src/routes/mobile/historySearch'),
]);
app.use('/mobile/service', [
    require('./src/routes/mobile/serviceRoute'),
]);
app.use('/mobile/customer', require('./src/routes/customerRoutes'));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message });
});

// app.get('/adminaccount', async (req, res) => {
//     try {
//         const user = new UserBasicInfo({
//             fullName: 'Admininistrator',
//             userName: 'admin',
//             password: 'admin!@#123',
//             role: 1
//         });
//         await user.save();
//         res.status(201).send({ message: 'User registered successfully!' });
//     } catch (err) {
//         if (err.message === 'User already exists!') {
//             return res.status(400).send({ error: err.message });
//         }
//         res.status(500).send({ error: 'Internal Server Error' });
//     }
// });

//app.use('/auth', require('./src/routes/authRoutes'));

const startServer = async () => {
    try {
        await connectToMongo();

        app.listen(port, () => {
            console.log(`Example app listening at http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Application startup aborted because MongoDB connection failed.');
        process.exit(1);
    }
};

startServer();
