import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import {MongoClient, ObjectId} from "mongodb"
import Joi from "joi"
import dayjs from "dayjs"
import { stripHtml } from "string-strip-html";


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

    const name = stripHtml(req.body.name).result.trim()

    db.collection("participants").find({name}).toArray()
    .then((data)=> {

        if(data.length !== 0){
            return res.status(409).send("name is already in use")
        }


        db.collection("participants").insertOne({name, lastStatus: Date.now()})
        .then(()=> console.log("inserido"))
        .catch(() => res.sendStatus(500))


        const mens = { from: name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format("HH:mm:ss") }
        db.collection("messages").insertOne(mens)
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

    if(req.headers.user === undefined || req.headers.user.length === 0){
        console.log(req.headers.user)
        return res.status(422).send("Usuario não especificado")
    }
    

    const nome = stripHtml(req.headers.user).result.trim()

    db.collection("participants").find({name: nome}).toArray()
    .then((data) => {

        if(data.length === 0){
            return res.status(422).send("Usuario não logado")
        }

        const to = stripHtml(req.body.to).result.trim()
        const text = stripHtml(req.body.text).result.trim()
        const type = stripHtml(req.body.type).result.trim()
        const message = {to,text,type, from: nome, time:dayjs().format("HH:mm:ss")}


        db.collection("messages").insertOne(message)
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

    db.collection("participants").find({name: user}).toArray()
    .then((data)=>{

        if(data.length === 0){
            return res.sendStatus(404)
        }

        const update = {$set: { lastStatus: Date.now()}}

        db.collection("participants").updateOne({name: user},update)
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

    db.collection("participants").find().toArray()
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

    db.collection("messages").find(querry).toArray()
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

//check
function check(){
    const now = Date.now() - 10000

    db.collection("participants").find({lastStatus: {$lt: now}}).toArray()
    .then((data)=>{

        if(data.length !== 0){

            const names = data.map((u) => {return {name: u.name}})
            const query = {$or: names}


            db.collection("participants").deleteMany(query)
            .then((d)=>{

                if(d.deletedCount > 0){
                    const messages = names.map(n => {return {from: n.name, to: 'Todos', text: 'sai da sala...', type: 'status', time: dayjs().format("HH:mm:ss")}})
                    db.collection("messages").insertMany(messages)
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


//DELETE

app.delete("/messages/:id",(req,res)=>{

    const { user } = req.headers
    const {id} = req.params

    console.log(user,id)

    db.collection("messages").find({_id: new ObjectId(id)}).toArray()
    .then(([message])=>{
        console.log(message)

        if(message === undefined){
            return res.status(404).send("Mensagem não existe")
        }

        if(user !== message.from){
            return res.status(401).send("A mensagem não foi enviado pelo usuario")
        }

        db.collection("messages").deleteOne({_id: new ObjectId(id)})
        .then((resposta)=>{
            console.log(resposta)
            return res.send("Mensagem removida")
        })
        .catch((err)=>{
            console.log(err)
            return res.sendStatus(500)
        })

        
    })
    .catch((err)=>{
        console.log(err)

        return res.sendStatus(500)
    })

})

//PUT
app.put("/messages/:id",(req,res)=>{

    const nome = req.headers.user
    const { id } = req.params

    const {error} = mes.validate(req.body)

    if(error){
        return res.status(422).send(error.details[0].message)
    }

    if(req.headers.user === undefined || req.headers.user.length === 0){
        console.log(req.headers.user)
        return res.status(422).send("Usuario não especificado")
    }

    const to = stripHtml(req.body.to).result.trim()
    const text = stripHtml(req.body.text).result.trim()
    const type = stripHtml(req.body.type).result.trim()

    const update = {
        $set: { to, text, type, from: nome, time: dayjs().format("HH:mm:ss") },
      };

    db.collection("participants").find({name: nome}).toArray()
    .then((dados)=>{
        

        if(dados.length === 0){
            return res.status(401).send("usuario não existe")
        }

        db.collection("messages").find({_id: new ObjectId(id)}).toArray()
        .then(([mensagem])=>{

            if(mensagem === undefined){
                return res.status(404).send("mensagem não existe")
            }

            if(mensagem.from !== nome){
                return res.status(401).send("A mensagem não foi enviado pelo usuario")
            }

            console.log(mensagem)

            db.collection("messages").updateOne({_id: new ObjectId(id)},update)
            .then((resposta)=>{

                return res.status(200).send("Mensagem alterada")
            })
            .catch((err)=>{

                return res.sendStatus(500)
            })
        })
        .catch((err)=>{
            return res.status(500).send(err)
        })

        
    })
    .catch((err)=>{
        console.log(err)

        return res.sendStatus(500)
    })

})


app.listen(PORT, ()=>{console.log(`rodando na porta ${PORT}`)})