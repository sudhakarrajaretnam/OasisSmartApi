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

mongoose.connect(process.env.OASSIS_DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});

app.get('/', async (req, res) => {
    //console.log('here');
    //res.send('Hello World!');

    //await ServiceStaff.updateMany({}, { $set: { disabled: false } });
    res.send('done');
    //res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({error: err.message});
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


app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});