import { LoginFormSchema, type CurrentUserData, type LoginFormData } from "@knot/backend/auth";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Form, Input, theme } from "antd";
import { AxiosInstance } from "@/lib/fetcher";
import { useUserMutate } from "@/lib/auth";
import axios from "axios";
import { useNavigate } from "react-router";


export function LoginForm() {    
    const navigate = useNavigate();
    const userMutator = useUserMutate();
    const { token } = theme.useToken();
    const { handleSubmit, formState: { errors }, control, setError } = useForm<LoginFormData>({
        resolver: zodResolver(LoginFormSchema),
        defaultValues: {
            email: "",
            password: ""
        }
    });

    const onSubmit = (data: LoginFormData) => {
        AxiosInstance.post<CurrentUserData>("/auth/login", data)
            .then((response) => {
                if (response.status === 200) {
                    // If successful - then we need to redirect
                    // but first - update the cache with the new user
                    if (userMutator) {
                        userMutator({ ...response.data });
                    } else {
                        console.error("Mutator is null");
                    }
                
                    navigate("/app");
                }
            })
            .catch((error) => {
                if (axios.isAxiosError(error)) {
                    if (error.status == 401) {
                        setError("root", { 
                            type: "manual", message: "Email and/or Password is incorrect" 
                        }); 
                        return
                    }
                }
                
                // Catch-all for other types of errors
                console.error(error);
                setError("root", { type: "manual", message: "An unknown error occured" });
            });
    };
    
    return <form onSubmit={handleSubmit(onSubmit)}>
        {errors.root && <p style={{ color: token.colorError }}>{errors.root.message}</p>}

        <Form.Item
            validateStatus={errors.email ? "error" : ""}
            help={errors.email?.message}
        >
            <Controller 
                name="email"
                control={control}
                render={({ field }) => <Input {...field} placeholder="Email"/>}
            />
        </Form.Item>
        
        <Form.Item
            validateStatus={errors.password ? "error" : ""}
            help={errors.password?.message}
        >
            <Controller 
                name="password"
                control={control}
                render={({ field }) => <Input {...field} type='password' placeholder="Password" />}
            />
        </Form.Item>

        <Form.Item label={null}>
            <Button type="primary" htmlType="submit">
                Login
            </Button>
        </Form.Item>
    </form>;
}