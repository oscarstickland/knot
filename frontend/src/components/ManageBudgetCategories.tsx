import { useState } from "react";
import { Result, Table, Typography, type TableProps } from "antd";
import useSWR from "swr";
import type { BudgetCategory } from "@knot/backend/budget";
import { CreateBudgetCategoryModal } from "@/components/CreateBudgetCategoryModal.tsx";
import { EditBudgetCategoryModal } from "@/components/EditBudgetCategoryModal.tsx";

const { Text } = Typography;

export function ManageBudgetCategories() {
    return <>
        <div style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "16px"
        }}>
            <Text type="secondary">Click a category to rename or delete it</Text>
            <CreateBudgetCategoryModal />
        </div>
        <BudgetCategoriesTable />
    </>
}

function BudgetCategoriesTable() {
    const { data, isLoading, error } = useSWR<BudgetCategory[]>("/budget/categories");
    const [selectedCategory, setSelectedCategory] = useState<BudgetCategory | null>(null);

    const columns: TableProps<BudgetCategory>['columns'] = [
        {
            key: "name",
            title: "Name",
            dataIndex: "name",
            sorter: (a, b) => a.name.localeCompare(b.name)
        }
    ];

    if (error) {
        return <Result status="error" title="Retrieval Error" subTitle="Unable to fetch budget categories." />
    }

    return <>
        <Table
            rowKey="id"
            columns={columns}
            loading={isLoading}
            dataSource={data ?? []}
            onRow={(category) => ({
                onClick: () => setSelectedCategory(category),
                style: { cursor: "pointer" }
            })}
        />
        {selectedCategory && (
            <EditBudgetCategoryModal category={selectedCategory} onClose={() => setSelectedCategory(null)} />
        )}
    </>
}
