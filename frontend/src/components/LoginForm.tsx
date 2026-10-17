import { LoginFormSchema, type CurrentUserData, type LoginFormData } from "@knot/backend/auth";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, Button, Form, Input } from "antd";
import { AxiosInstance } from "@/lib/fetcher.tsx";
import { useUserMutate } from "@/lib/auth.tsx";
import axios from "axios";
import { useNavigate } from "react-router";


export function LoginForm() {    
    const navigate = useNavigate();
    const userMutator = useUserMutate();
    const { handleSubmit, formState: { errors, isSubmitting }, control, setError } = useForm<LoginFormData>({
        resolver: zodResolver(LoginFormSchema),
        defaultValues: {
            email: "",
            password: ""
        }
    });

    const onSubmit = (data: LoginFormData) => {
        return AxiosInstance.post<CurrentUserData>("/auth/login", data)
            .then(async (response) => {
                if (response.status === 200) {
                    // If successful - then we need to redirect
                    // but first - update the cache with the new user
                    if (userMutator) {
                        await userMutator({ ...response.data });
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
    
    return <Form component={false} layout="vertical" requiredMark={false}>
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {errors.root && <Alert type="error" showIcon message={errors.root.message} style={{ marginBottom: 20 }} />}

        <Form.Item
            label="Email"
            htmlFor="login-email"
            validateStatus={errors.email ? "error" : ""}
            help={errors.email?.message}
        >
            <Controller 
                name="email"
                control={control}
                render={({ field }) => <Input {...field} id="login-email" type="email" size="large" autoComplete="email" autoFocus />}
            />
        </Form.Item>
        
        <Form.Item
            label="Password"
            htmlFor="login-password"
            validateStatus={errors.password ? "error" : ""}
            help={errors.password?.message}
        >
            <Controller 
                name="password"
                control={control}
                render={({ field }) => <Input.Password {...field} id="login-password" size="large" autoComplete="current-password" />}
            />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting} style={{ marginTop: 8 }}>
            Sign in
        </Button>
    </form>
    </Form>;
}