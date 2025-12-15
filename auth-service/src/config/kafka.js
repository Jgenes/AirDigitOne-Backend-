import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';
dotenv.config();

const kafka = new Kafka({
  clientId: process.env.SERVICE_NAME,
  brokers: process.env.KAFKA_BROKERS.split(',')
});

export const producer = kafka.producer();
await producer.connect();
