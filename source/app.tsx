import React from 'react';
import { Box, Text } from 'ink';

type Props = {
    name: string | undefined;
};

export default function App({ name = 'Stranger' }: Props) {
    return (
        <Box width="100%" height="100%">
            <Text>
                Hello, <Text color="green">{name}</Text>
            </Text>
        </Box>
    );
}
