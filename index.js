const express = require('express')
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express()
const port = process.env.PORT || 5000

// app.use(cors());
// app.use(express.json())

const corsConfig = {
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}
app.use(cors(corsConfig))
app.options("*", cors(corsConfig))
app.use(express.json())
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept,authorization")
  next()
})

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    req.decoded = decoded;
    next();
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jooei.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

async function run() {
  try {
    await client.connect();
    const ProductsCollection = client.db('computer_parts_manufacturer').collection('products')
    const orderCollection = client.db('computer_parts_manufacturer').collection('booking')
    const userCollection = client.db('computer_parts_manufacturer').collection('users');
    const reviewsCollection = client.db('computer_parts_manufacturer').collection('reviews');
    const paymentCollection = client.db('computer_parts_manufacturer').collection('payments');

    app.get('/product', async (req, res) => {
      const query = {};
      const cursor = ProductsCollection.find(query);
      const products = (await cursor.toArray()).reverse();
      res.send(products)
    })


    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const cursor = await userCollection.findOne(query);
      res.send(cursor)
    })

    // find one
    app.get('/product/:id', async (req, res) => {
      const id = req.params;
      const query = { _id: ObjectId(id) };
      const product = await ProductsCollection.findOne(query);
      res.send(product);
    })



    app.post('/order', async (req, res) => {
      const booking = req.body;
      const result = await orderCollection.insertOne(booking)
      res.send({ success: true, message: "Successfully ordered ", result });
    })


    app.get('/review', async (req, res) => {
      const query = {}
      const result = await reviewsCollection.find(query).toArray()
      res.send(result)
    }
    )

    app.post('/review', async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review)
      res.send({ success: true, message: "reviews added ", result });
    })

    app.post('/product', async (req, res) => {
      const newProduct = req.body;
      const result = await ProductsCollection.insertOne(newProduct)
      res.send({ success: true, message: "product added ", result });
    })

    app.get('/order', verifyJWT, async (req, res) => {
      const orders = req.query.email;
      const decodedEmail = req.decoded.email;
      if (orders === decodedEmail) {
        const query = { email: orders };
        const result = await orderCollection.find(query).toArray();
        res.send(result)
        return;
      }
      return res.status(403).send({ message: 'forbidden access' })
    })

    app.put('/user/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({ email: requester });
      if (requesterAccount.role === 'admin') {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send({ success: true, message: 'admin added', result });
        return;
      }
      else (
        res.status(403).send({ message: 'forbidden access' })
      )

    })

    app.get('/admin/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })

    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ result, token });
    })

    app.get('/user', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })



    app.put('/updateuser/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send({ success: true, result });
    })



    app.get('/user', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })

    //delete item
    app.delete('/items/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await orderCollection.deleteOne(query);
      res.send(result);
    })


    // payment start
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      console.log(price);
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({ clientSecret: paymentIntent.client_secret })
    });


    app.patch('/order/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId
        }
      }

      const result = await paymentCollection.insertOne(payment);
      const updatedOrder = await orderCollection.updateOne(filter, updatedDoc);
      res.send(updatedOrder);
    });

    app.get('/order/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      console.log(query);
      const result = await orderCollection.findOne(query);
      res.send(result);
    })
  }
  finally {

  }

}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('computer all parts manufacturer!')
})

app.listen(port, () => {
  console.log(`hello i am from ${port}`)
})