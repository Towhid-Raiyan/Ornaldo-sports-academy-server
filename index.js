const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const app = express();
const stripe = require("stripe")(process.env.SECRET_KEY);
const port = process.env.PORT || 5000;


const corsConfig = {
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Origin",
        "X-Requested-With",
        "Accept",
        "x-client-key",
        "x-client-token",
        "x-client-secret",
        "Authorization",
    ],
    credentials: true,
};


//middleware
app.use(cors(corsConfig));
app.options("*", cors(corsConfig));
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res
            .status(401)
            .send({ error: true, message: "Unauthorized Access!!!" });
    }
    const token = authorization.split(" ")[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res
                .status(403)
                .send({ error: true, message: "Forbidden Access!!!" });
        }
        req.decoded = decoded;
        next();
    });
};


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cq8nopc.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const usersCollection = client.db("ornaldoSportsDB").collection("users");
        const classesCollection = client
            .db("ornaldoSportsDB")
            .collection("classes");
        const selectedCourseCollection = client
            .db("ornaldoSportsDB")
            .collection("selectedCourse");
        const paymentCollection = client
            .db("ornaldoSportsDB")
            .collection("payment");
        // jwt
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, {
                expiresIn: "2h",
            });
            res.send({ token });
        });

        // homepage
        // popular classses
        app.get("/popularClasses", async (req, res) => {
            try {
                const popularClasses = await classesCollection
                    .find()
                    .sort({ enrolledStudents: -1 })
                    .limit(6)
                    .toArray();
                res.json(popularClasses);
            } catch (error) {
                console.error("Error fetching popular classes:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });
        // popular instructors

        // Assuming you have a "instructors" collection in your MongoDB database
        // Retrieve the top 6 instructors based on the number of students in their classes
        app.get("/popularInstructors", async (req, res) => {
            try {
                const popularInstructors = await usersCollection
                    .aggregate([
                        {
                            $match: { role: "instructor" },
                        },
                        {
                            $lookup: {
                                from: "classes",
                                localField: "name",
                                foreignField: "instructor",
                                as: "classes",
                            },
                        },
                        {
                            $unwind: "$classes",
                        },
                        {
                            $group: {
                                _id: "$_id",
                                name: { $first: "$name" },
                                image: { $first: "$image" },
                                totalStudents: {
                                    $sum: "$classes.enrolledStudents",
                                },
                                course: { $first: "$classes.name" },
                            },
                        },
                        {
                            $sort: { totalStudents: -1 },
                        },
                        {
                            $limit: 6,
                        },
                    ])
                    .toArray();

                res.json(popularInstructors);
            } catch (error) {
                console.error("Error fetching popular instructors:", error);
                res.status(500).json({ error: "Internal server error" });
            }
        });


        // store an user to the database
        app.post("/users", async (req, res) => {
            const user = req.body;
            const query = { email: user.email };
            const existingUser = await usersCollection.findOne(query);
            console.log(user);
            if (existingUser) {
                return res.send({ message: "User already exists!" });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

         //   get approved classes
         app.get("/classes", async (req, res) => {
            const classes = await classesCollection
                .find({ status: "approved" })
                .toArray();
            res.send(classes);
        });


        // get all instructos
        app.get("/instructors", async (req, res) => {
            const instructors = await usersCollection
                .find({ role: "instructor" })
                .toArray();
            res.send(instructors);
        });

        // get total count of instructors classes
        app.get("/classes/count/:instructorName", async (req, res) => {
            const instructorName = req.params.instructorName;
            const classCount = await classesCollection.countDocuments({
                instructor: instructorName,
            });
            console.log(classCount);
            res.json({ count: classCount });
        });
        //save selected class
        app.post("/classes",verifyJWT, async (req, res) => {
            const selectedClass = req.body;
            // check already selected or not ?
            const email = selectedClass.email;
            const courseId = selectedClass.course._id;

            const existingSelection = await selectedCourseCollection.findOne({
                email: email,
                "course._id": courseId,
            });
            if (existingSelection) {
                // Email has already selected this course
                return res.send({
                    error: "This course has already been selected by the email.",
                });
            }
            
            // console.log(selectedClass);
            const result = await selectedCourseCollection.insertOne(
                selectedClass
            );
            res.send(result);
        });
        app.delete('/deleteSelected/:id',verifyJWT,async(req,res)=>{
            const id = req.params.id;
            const result = await selectedCourseCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result)
        })

        // get selected classes
        app.get("/selectedClasses/:email",verifyJWT, async (req, res) => {
            const email = req.params.email;
            console.log(email);
            const selectedClasses = await selectedCourseCollection
                .find({ email })
                .toArray();
            res.send(selectedClasses);
        });

         // get all classes
         app.get("/all-classes", async (req, res) => {
          
            const allClasses = await classesCollection.find().toArray();
            res.send(allClasses);
        });

        // get selected class using id
        app.get("/pay/selectedClasses/:id",verifyJWT, async (req, res) => {
          
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedCourseCollection.findOne(query);
            console.log(result);
            res.send(result);
        });

        // store payment
        app.post("/payments",verifyJWT, async (req, res) => {
            const payment = req.body;

            const result = await paymentCollection.insertOne(payment);

            const selectedCourseID = payment.selectedCourseID;
            // now in selectedCourseCollection change this course status to paid
            await selectedCourseCollection.updateOne(
                { _id: new ObjectId(selectedCourseID) },
                { $set: { status: "paid" } }
            );

            const courseID = payment.courseId;
            // now from this classesCollection available seat will reduce by 1 and enrolledStudents will increase by 1
            await classesCollection.updateOne(
                { _id: new ObjectId(courseID) },
                { $inc: { availableSeats: -1, enrolledStudents: 1 } }
            );
            res.send(result);
        });

        // isStudent??
        app.get("/users/student/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;

            console.log(email);
            if (req.decoded.email !== email) {
                res.send({ student: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { student: user?.role === "student" };
            res.send(result);
        });

        // make payment intent
        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });
        // get payment history
        app.get("/payment-history/:email",verifyJWT, async (req, res) => {
            const email = req.params.email;

            // Find payment histories for the provided email using the paymentCollection
            const result = await paymentCollection
                .find({ user: email })
                .toArray();
            res.send(result);
        });

        // isInstructor??
        app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;

            console.log(email);
            if (req.decoded.email !== email) {
                res.send({ instructor: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === "instructor" };
            res.send(result);
        });

        // add a course
        app.post("/api/classes",verifyJWT, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass);
            res.send(result);
        });
        // get all class of a instructor
        app.get("/all-classes/:email",verifyJWT, async (req, res) => {
            const userEmail = req.params.email;
            console.log("hitted");
            const allClasses = await classesCollection
                .find({ email: userEmail })
                .toArray();
            res.send(allClasses);
        });

        // for admin

        app.get("/all-users", verifyJWT, async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });
        // update user role
        app.patch("/users/:userId",verifyJWT, async (req, res) => {
            const userId = req.params.userId;
            const { role } = req.body;

            const result = await usersCollection.updateOne(
                { _id: new ObjectId(userId) },
                { $set: { role } }
            );
            console.log(result);
            res.send(result);
        });
        // verify admin?
        app.get("/users/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;

            console.log(email);
            if (req.decoded.email !== email) {
                res.send({ admin: false });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === "admin" };
            res.send(result);
        });
        // approve a class
        app.patch("/api/classes/:classId/approve",verifyJWT, async (req, res) => {
            const { classId } = req.params;
            console.log(classId);
            try {
                const updatedClass = await classesCollection.updateOne(
                    { _id: new ObjectId(classId) },
                    { $set: { status: "approved" } }
                );
                res.send(updatedClass);
            } catch (error) {
                console.error("Error approving class:", error);
                res.sendStatus(500);
            }
        });
        // deny a class
        app.patch("/api/classes/:classId/deny",verifyJWT, async (req, res) => {
            const { classId } = req.params;
            console.log(classId);
            try {
                const updatedClass = await classesCollection.updateOne(
                    { _id: new ObjectId(classId) },
                    { $set: { status: "denied" } }
                );
                res.send(updatedClass);
            } catch (error) {
                console.error("Error deny class:", error);
                res.sendStatus(500);
            }
        });
        // Add Feedback to Class
        app.post("/api/classes/:classId/feedback",verifyJWT, async (req, res) => {
            const { classId } = req.params;
            const { feedback } = req.body;
            try {
                const updatedClass = await classesCollection.updateOne(
                    { _id: new ObjectId(classId) },
                    { $set: { feedback: feedback } }
                );
                res.send(updatedClass);
            } catch (error) {
                console.error("Error adding feedback to class:", error);
                res.sendStatus(500);
            }
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get("/", (req, res) => {
    res.send("Ornaldo Sports Server is Running...");
});

app.listen(port, () => {
    console.log(`Ornaldo Sports Server Running on PORT:  ${port}`);
});