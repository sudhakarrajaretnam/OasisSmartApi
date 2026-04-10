const nodemailer = require('nodemailer');

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getMailConfig = () => {
    const { MAIL_USER, MAIL_PASS, MAIL_TO } = process.env;

    if (!MAIL_USER) {
        throw new Error('MAIL_USER is not configured.');
    }

    if (!MAIL_PASS) {
        throw new Error('MAIL_PASS is not configured.');
    }

    if (MAIL_PASS === 'your_google_app_password') {
        throw new Error('MAIL_PASS is still using the placeholder value. Replace it with your Gmail App Password.');
    }

    if (!MAIL_TO) {
        throw new Error('MAIL_TO is not configured.');
    }

    return { MAIL_USER, MAIL_PASS, MAIL_TO };
};

const sendOrderMail = async ({ customer, order, items = [] }) => {
    const { MAIL_USER, MAIL_PASS, MAIL_TO } = getMailConfig();

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: MAIL_USER,
            pass: MAIL_PASS,
        },
    });

    const itemRows = items.map((item, index) => {
        const itemName = item.buyItem?.itemName || 'Item';
        const unit = item.buyItem?.unit || '';
        const price = Number(item.price) || 0;
        const quantity = Number(item.quantity) || 0;
        const subtotal = price * quantity;

        return `
            <tr>
                <td style="padding:8px; border:1px solid #ccc;">${index + 1}</td>
                <td style="padding:8px; border:1px solid #ccc;">${escapeHtml(itemName)}</td>
                <td style="padding:8px; border:1px solid #ccc;">${escapeHtml(`${quantity} ${unit}`.trim())}</td>
                <td style="padding:8px; border:1px solid #ccc;">${price}</td>
                <td style="padding:8px; border:1px solid #ccc;">${subtotal}</td>
            </tr>
        `;
    }).join('');

    const html = `
        <h2>New Order Received</h2>

        <h3>Customer Details</h3>
        <p><b>Name:</b> ${escapeHtml(customer?.fullName || '-')}</p>
        <p><b>Mobile:</b> ${escapeHtml(customer?.mobile || '-')}</p>
        <p><b>Address:</b> ${escapeHtml(customer?.address || '-')}</p>
      

        <h3>Order Details</h3>
        <p><b>Order ID:</b> ${escapeHtml(order?.orderId || '-')}</p>
        <p><b>Total Price:</b> ${escapeHtml(order?.totalPrice || 0)}</p>
        <p><b>Status:</b> ${escapeHtml(order?.status || '-')}</p>
        <p><b>Created At:</b> ${escapeHtml(order?.createdAt ? new Date(order.createdAt).toLocaleString('en-IN') : '-')}</p>

        <h3>Items</h3>
        <table style="border-collapse:collapse; width:100%;">
            <thead>
                <tr>
                    <th style="padding:8px; border:1px solid #ccc;">S.No</th>
                    <th style="padding:8px; border:1px solid #ccc;">Item Name</th>
                    <th style="padding:8px; border:1px solid #ccc;">Qty</th>
                    <th style="padding:8px; border:1px solid #ccc;">Price</th>
                    <th style="padding:8px; border:1px solid #ccc;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                ${itemRows}
            </tbody>
        </table>
    `;

    try {
        const info = await transporter.sendMail({
            from: MAIL_USER,
            to: MAIL_TO,
            subject: `New Order - Order ID ${order?.orderId || 'N/A'}`,
            html,
        });

        console.log('[sendOrderMail] Mail sent successfully:', info.response || info.messageId || info);
        return info;
    } catch (error) {
        console.error('[sendOrderMail] Mail send failed:', error);
        throw error;
    }
};

module.exports = sendOrderMail;
