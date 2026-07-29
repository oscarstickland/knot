import axios from 'axios';

export const AxiosInstance = axios.create({
    baseURL: "http://localhost:3000",
    headers: {
        'Content-Type': 'application/json'
    },
    withCredentials: true
});

export const fetcher = (url: string) => AxiosInstance.get(url).then((res) => res.data);