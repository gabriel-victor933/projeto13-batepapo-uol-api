import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import {MongoClient} from "mongodb"
import Joi from "joi"
import dayjs from "dayjs"


//.ENV config
dotenv.config()

// server config
const app = express()
app.use(express.json())
app.use(cors())
const PORT = 5000;


//mongodb config
let db 
const mongoClient = new MongoClient(process.env.DATABASE_URL)
mongoClient.connect()
.then(()=> db = mongoClient.db())
.catch((err)=> console.log(err))

// joi validation config
const part = Joi.object({
    name: Joi.string().min(1).required()
})

const mes = Joi.object({
    to: Joi.string().min(1).required(),
    text: Joi.string().min(1).required(),
    type: Joi.alternatives().try(
        Joi.string().valid('message'),
        Joi.string().valid('private_message')
    ).required()
})


// POST server methods 
app.post("/participants",(req,res)=>{

    const { error } = part.validate(req.body);

    if (error) {
        return res.status(422).send(error.message)
    }

    db.collection("participante").find(req.body).toArray()
    .then((data)=> {

        if(data.length !== 0){
            return res.status(409).send("name is already in use")
        }


        db.collection("participante").insertOne({...req.body, lastStatus: Date.now()})
        .then(()=> console.log("inserido"))
        .catch(() => res.sendStatus(500))


        const mens = { from: req.body.name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss") }
        db.collection("mensagem").insertOne(mens)
        .then(()=>{
            return res.status(201).send("OK")
        })
        .catch((err)=> {
            return res.sendStatus(500)
        })


    })
    .catch((err) => console.log(err))


})

app.post("/messages",(req,res)=>{
    
    const {error} = mes.validate(req.body)

    if(error){
        return res.status(422).send(error.details[0].message)
    }


    db.collection("participante").find({name: req.headers.user}).toArray()
    .then((data) => {

        if(data.length === 0){
            return res.status(422).send("Usuario não logado")
        }

        const message = {...req.body, from: req.headers.user, time:dayjs().format("HH:mm:ss")}


        db.collection("mensagem").insertOne(message)
        .then(()=>{
            return res.status(201).send("mensagem enviada")
        })
        .catch((err)=>{
            return res.status(500).send(err)
        })
    })
    .catch((err) => {
        res.status(500)
    })


    
})

app.post("/status",(req,res)=>{
    const {user} = req.headers

    if(user === undefined){
        return res.status(404).send("erro")
    }

    db.collection("participante").find({name: user}).toArray()
    .then((data)=>{

        if(data.length === 0){
            return res.sendStatus(404)
        }

        const update = {$set: { lastStatus: Date.now()}}

        db.collection("participante").updateOne({name: user},update)
        .then(()=>{
            return res.status(200).send("ok")
        })
        .catch((err)=>{
            return res.status(500).send(err)
        })

    })
    .catch((err)=>{
        return res.status(500).send(err)
    })

})


// GET server methods
app.get("/participants",(req,res) => {

    db.collection("participante").find().toArray()
    .then((data)=>{

        return res.status(201).send(data)
    })
    .catch((err) => {
        return res.status(500).send(err)
    })

})

app.get("/messages",(req,res)=>{

    const {limit} = req.query
    const {user} = req.headers

    const querry = { $or: [ { to: "Todos" }, { to: user }, { from: user } ] }

    db.collection("mensagem").find(querry).toArray()
    .then((data)=> {

        if(limit === undefined){
            return res.status(200).send(data)
        }

        if(limit > 0){
            return res.status(200).send(data.slice(0,limit))
        }


        return res.status(422).send("limit invalido")

        
        
        /* else if(limit){
            return res.status(200).send(data.slice(0,limit))
        } else {
            return res.status(200).send(data)
        } */
        
    })
    .catch((err) =>{
        return res.status(500).send(err)
    })
})


function check(){
    const now = Date.now() - 10000

    db.collection("participante").find({lastStatus: {$lt: now}}).toArray()
    .then((data)=>{

        if(data.length !== 0){

            const names = data.map((u) => {return {name: u.name}})
            const query = {$or: names}


            db.collection("participante").deleteMany(query)
            .then((d)=>{

                if(d.deletedCount > 0){
                    const messages = names.map(n => {return {from: n.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: dayjs().format("HH:mm:ss")}})
                    db.collection("mensagem").insertMany(messages)
                    .then(()=>{
                        console.log("enviados")
                    })
                    .catch((err)=>{
                        console.log(err)
                    })
                }
                
            }) 
            .catch((err)=> console.log(err))

        }
    })
    .catch((err)=>{
        console.log(err)
    })
}

setInterval(check,10000)

app.listen(PORT, ()=>{console.log(`rodando na porta ${PORT}`)})