const nodemailer = require('nodemailer');

const sendServiceOrderMail = async ({ customer, orders }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
        },
    });

    const orderRows = orders.map((order, index) => {
        return `
            <tr>
                <td>${index + 1}</td>
                <td>${order.orderId || ''}</td>
                <td>${order.service?.serviceName || ''}</td>
                <td>${order.quantity || 0}</td>
                <td>${order.price || 0}</td>
                <td>${order.selectDate || ''}</td>
                <td>${order.selectTime || ''}</td>
                <td>${order.notes || ''}</td>
            </tr>
        `;
    }).join('');

    const totalAmount = orders.reduce((sum, order) => {
        return sum + (Number(order.price) * Number(order.quantity));
    }, 0);

    const mailOptions = {
        from: process.env.MAIL_USER,
        to: process.env.MAIL_TO,
        subject: 'New Service Order Received',
        html: `
            <h2>New Service Order</h2>

            <p><strong>Customer Name:</strong> ${customer.fullName || ''}</p>
            <p><strong>Phone:</strong> ${customer.mobile || ''}</p>
            <p><strong>Address:</strong> ${customer.address || ''}</p>

            <h3>Order Details</h3>
            <table border="1" cellspacing="0" cellpadding="8">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Order ID</th>
                        <th>Service Name</th>
                        <th>Quantity</th>
                        <th>Price</th>
                        <th>Select Date</th>
                        <th>Select Time</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${orderRows}
                </tbody>
            </table>

            <p><strong>Total Amount:</strong> ₹${totalAmount}</p>
        `,
    };

    return await transporter.sendMail(mailOptions);
};

module.exports = sendServiceOrderMail;