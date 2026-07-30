import axios from 'axios';

export const AxiosInstance = axios.create({
    baseURL: process.env.NODE_ENV === "production" ? "/api" : "http://localhost:3000/api",
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
});

export const fetcher = (url: string) => AxiosInstance.get(url).then((res) => res.data);