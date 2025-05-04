To generate VAPID keys for your push notifications, here's a simple HTML page that you can use to generate and display the keys: https://steveseguin.github.io/vapid/

Now, if you need to use these VAPID keys in your project, here's how to implement browser push notifications with the generated keys:

You now have the complete set of tools to implement browser push notifications with VAPID keys:

1. **VAPID Keys Generator**: Use the HTML page I provided to generate your VAPID public/private key pair. This only needs to be done once. After generating, store these keys securely.

2. **Client-Side Implementation**: 
   - Register a service worker
   - Subscribe users to push notifications using your VAPID public key
   - Send the subscription object to your server
   - Handle unsubscription

3. **Service Worker Implementation**:
   - Listen for push events
   - Display notifications when push events occur
   - Handle notification clicks

4. **Server-Side Implementation**:
   - Save user subscriptions
   - Send notifications to subscribed users

To use these keys in your project:

1. First, generate your VAPID keys using the HTML generator
2. Copy the public and private keys and store them securely
3. In your client-side code, replace 'YOUR_VAPID_PUBLIC_KEY' with your actual public key
4. In your server-side code, set both keys and your contact email

The implementation follows VAPID (Voluntary Application Server Identification) for web push notifications, which allows your server to identify itself to push services. This approach improves delivery rates and security by encrypting your messages and is required by browsers like Microsoft Edge.

Remember that VAPID keys should be generated only once and used for all future messages you send, so store them securely after generation.

// CLIENT SIDE IMPLEMENTATION

// 1. First, register your service worker
if ('serviceWorker' in navigator && 'PushManager' in window) {
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
} else {
  console.warn('Push notifications are not supported in this browser');
}

// Register the service worker
async function registerServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('Service Worker registered successfully:', registration);
    
    // After registration, check if already subscribed
    const subscription = await registration.pushManager.getSubscription();
    const isSubscribed = !(subscription === null);
    
    if (isSubscribed) {
      console.log('User is already subscribed to push notifications');
      // You might want to update your server with the subscription
      updateSubscriptionOnServer(subscription);
    } else {
      // If not subscribed, you can show a button for subscribing
      console.log('User is not subscribed to push notifications');
    }
  } catch (error) {
    console.error('Service Worker registration failed:', error);
  }
}

// Subscribe user to push notifications
async function subscribeToPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Your VAPID public key (from the generator)
    const vapidPublicKey = 'YOUR_VAPID_PUBLIC_KEY';
    
    // Convert the public key to the format needed by the browser
    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,  // Always show notifications
      applicationServerKey: applicationServerKey
    });
    
    console.log('User subscribed to push notifications:', subscription);
    
    // Send the subscription object to your server
    await updateSubscriptionOnServer(subscription);
    
    return subscription;
  } catch (error) {
    console.error('Failed to subscribe the user:', error);
    return null;
  }
}

// Helper function to convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Send the subscription to your server
async function updateSubscriptionOnServer(subscription) {
  if (!subscription) return;

  try {
    const response = await fetch('/api/save-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });

    if (!response.ok) {
      throw new Error('Bad status code from server.');
    }
    
    const responseData = await response.json();
    console.log('Subscription saved on server:', responseData);
  } catch (error) {
    console.error('Error saving subscription on server:', error);
  }
}

// Unsubscribe from push notifications
async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      console.log('User is not subscribed');
      return;
    }
    
    // Unsubscribe from push
    await subscription.unsubscribe();
    
    // Notify your server about unsubscription
    await fetch('/api/remove-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });
    
    console.log('User unsubscribed from push notifications');
  } catch (error) {
    console.error('Error unsubscribing:', error);
  }
}

// ------------------------------------------------------------
// SERVICE WORKER IMPLEMENTATION (service-worker.js)
// ------------------------------------------------------------

/*
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    
    // Show notification based on payload data
    const promiseChain = self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      data: data.data,
      actions: data.actions
    });
    
    event.waitUntil(promiseChain);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  // Add your notification click behavior here
  if (event.notification.data && event.notification.data.url) {
    clients.openWindow(event.notification.data.url);
  }
});
*/

// ------------------------------------------------------------
// SERVER-SIDE IMPLEMENTATION (Node.js with Express)
// ------------------------------------------------------------

/*
const express = require('express');
const webpush = require('web-push');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Set your VAPID keys
const vapidKeys = {
  publicKey: 'YOUR_VAPID_PUBLIC_KEY',
  privateKey: 'YOUR_VAPID_PRIVATE_KEY'
};

// Set VAPID details
webpush.setVapidDetails(
  'mailto:your-email@example.com',  // A contact email for push service
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// Store subscriptions (in a real app, use a database)
const subscriptions = [];

// Save subscription
app.post('/api/save-subscription', (req, res) => {
  const subscription = req.body;
  
  // Store it (in a database in production)
  subscriptions.push(subscription);
  
  res.status(201).json({ message: 'Subscription saved' });
});

// Remove subscription
app.post('/api/remove-subscription', (req, res) => {
  const subscription = req.body;
  
  // Remove it from storage
  // This is simplified - in a real app you'd use a proper database query
  const index = subscriptions.findIndex(
    sub => sub.endpoint === subscription.endpoint
  );
  
  if (index !== -1) {
    subscriptions.splice(index, 1);
  }
  
  res.status(200).json({ message: 'Subscription removed' });
});

// Send notification to a specific subscription
app.post('/api/send-notification', (req, res) => {
  const subscription = req.body.subscription;
  const payload = JSON.stringify({
    title: req.body.title || 'New Notification',
    body: req.body.body || 'This is a push notification',
    icon: req.body.icon || '/icon.png',
    badge: req.body.badge || '/badge.png',
    data: {
      url: req.body.url || '/'
    }
  });
  
  const options = {
    TTL: 60 * 60  // Time to live - one hour
  };
  
  webpush.sendNotification(subscription, payload, options)
    .then(() => {
      res.status(200).json({ message: 'Notification sent successfully' });
    })
    .catch(error => {
      console.error('Error sending notification:', error);
      res.status(500).json({ message: 'Error sending notification', error });
    });
});

// Send notification to all subscriptions
app.post('/api/send-notification-to-all', (req, res) => {
  const payload = JSON.stringify({
    title: req.body.title || 'New Notification',
    body: req.body.body || 'This is a push notification',
    icon: req.body.icon || '/icon.png',
    badge: req.body.badge || '/badge.png',
    data: {
      url: req.body.url || '/'
    }
  });
  
  const options = {
    TTL: 60 * 60  // Time to live - one hour
  };
  
  const sendPromises = subscriptions.map(subscription => 
    webpush.sendNotification(subscription, payload, options)
      .catch(error => {
        console.error('Error sending notification:', error);
        // If subscription is invalid, we should remove it
        if (error.statusCode === 410) {
          // Remove the invalid subscription
          const index = subscriptions.indexOf(subscription);
          if (index !== -1) {
            subscriptions.splice(index, 1);
          }
        }
      })
  );
  
  Promise.all(sendPromises)
    .then(() => {
      res.status(200).json({ message: 'Notifications sent' });
    })
    .catch(error => {
      console.error('Error sending notifications:', error);
      res.status(500).json({ message: 'Error sending notifications', error });
    });
});

app.listen(3000, () => {
  console.log('Server started on port 3000');
});
*/
